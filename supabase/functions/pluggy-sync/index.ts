// Sincroniza contas e lançamentos da Pluggy (MeuPluggy) para a fila de revisão da família.
// Roda com a identidade do usuário (JWT): as regras de acesso (RLS) do banco continuam valendo.
// Segredos necessários (Supabase → Edge Functions → Secrets): PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PLUGGY = 'https://api.pluggy.ai';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const isoDate = (d) => d.toISOString().slice(0, 10);
// A Pluggy envia datas em UTC; o app trabalha em horário de Brasília (UTC-3).
const brDate = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const dayOf = (iso) => (iso ? Number(String(iso).slice(8, 10)) || null : null);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function pluggyKey() {
  // trim(): ao colar pelo celular costuma sobrar espaço ou quebra de linha no fim do valor.
  const clientId = (Deno.env.get('PLUGGY_CLIENT_ID') ?? '').trim();
  const clientSecret = (Deno.env.get('PLUGGY_CLIENT_SECRET') ?? '').trim();
  if (!clientId || !clientSecret) throw new Error('Credenciais da Pluggy não configuradas no Supabase.');
  const r = await fetch(`${PLUGGY}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) {
    // Só informa tamanho e formato (nunca os valores) para ajudar a achar o erro de colagem.
    const idFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId) ? 'formato correto' : 'formato diferente de um UUID';
    throw new Error(`Falha ao autenticar na Pluggy (${r.status}). Client ID: ${clientId.length} caracteres (${idFormat}); Client Secret: ${clientSecret.length} caracteres. Confira se os dois foram copiados inteiros e nos campos certos.`);
  }
  return (await r.json()).apiKey;
}

async function pluggyGet(path, key) {
  const r = await fetch(PLUGGY + path, { headers: { 'X-API-KEY': key } });
  if (!r.ok) throw new Error(`A Pluggy respondeu ${r.status} em ${path.split('?')[0]}.`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: u, error: ue } = await sb.auth.getUser();
    if (ue || !u?.user) return json({ error: 'Não autenticado.' }, 401);
    const uid = u.user.id;

    const { data: fm, error: fe } = await sb
      .from('family_members').select('family_id,display_name')
      .eq('user_id', uid).eq('active', true).maybeSingle();
    if (fe) throw fe;
    if (!fm) return json({ error: 'Usuário sem família vinculada.' }, 400);
    const family = fm.family_id;

    const { data: conns, error: ce } = await sb
      .from('bank_connections').select('id,item_id,institution,last_synced_at').eq('family_id', family);
    if (ce) throw ce;
    if (!conns?.length) return json({ error: 'Nenhum banco conectado. Use "Conectar banco" primeiro.' }, 400);

    const key = await pluggyKey();
    let newAccounts = 0, newTransactions = 0;
    const errors = [];

    for (const c of conns) {
      try {
      const accData = await pluggyGet(`/accounts?itemId=${encodeURIComponent(c.item_id)}`, key);
      const list = accData.results ?? [];
      const extIds = list.map((a) => a.id);

      // Contas novas (as já importadas não são alteradas).
      const { data: have, error: he } = await sb
        .from('financial_accounts').select('external_id').eq('family_id', family).in('external_id', extIds);
      if (he) throw he;
      const haveSet = new Set((have ?? []).map((x) => x.external_id));
      const fresh = list.filter((a) => !haveSet.has(a.id)).map((a) => ({
        family_id: family,
        external_id: a.id,
        name: String(a.marketingName || a.name || 'Conta').slice(0, 80) + (a.type === 'CREDIT' && a.number ? ` •••• ${a.number}` : ''),
        account_type: a.type === 'CREDIT' ? 'credit_card' : 'bank_account',
        owner_user_id: uid,
        owner_name: fm.display_name,
        scope: 'individual',
        credit_limit: a.creditData?.creditLimit ?? null,
        closing_day: dayOf(a.creditData?.balanceCloseDate),
        due_day: dayOf(a.creditData?.balanceDueDate),
        created_by: uid,
      }));
      if (fresh.length) {
        const { error } = await sb.from('financial_accounts').insert(fresh);
        if (error) throw error;
        newAccounts += fresh.length;
      }

      const { data: mine, error: me } = await sb
        .from('financial_accounts').select('id,external_id').eq('family_id', family).in('external_id', extIds);
      if (me) throw me;
      const idOf = new Map((mine ?? []).map((x) => [x.external_id, x.id]));

      const from = c.last_synced_at
        ? isoDate(new Date(new Date(c.last_synced_at).getTime() - 7 * 864e5))
        : isoDate(new Date(Date.now() - 90 * 864e5));
      const to = isoDate(new Date());

      for (const a of list) {
        try {
        const txs = [];
        let page = 1, totalPages = 1;
        do {
          const res = await pluggyGet(
            `/transactions?accountId=${encodeURIComponent(a.id)}&from=${from}&to=${to}&pageSize=500&page=${page}`, key);
          totalPages = res.totalPages ?? 1;
          for (const t of res.results ?? []) if (t.status !== 'PENDING' && Number(t.amount) !== 0) txs.push(t);
          page++;
        } while (page <= totalPages);
        if (!txs.length) continue;

        // Não reimporta o que já está na fila de revisão (pendente, aprovado ou ignorado).
        const seen = new Set();
        for (const ids of chunk(txs.map((t) => t.id), 100)) {
          const { data: ex, error: ee } = await sb
            .from('bank_import_review').select('external_transaction_id')
            .eq('family_id', family).in('external_transaction_id', ids);
          if (ee) throw ee;
          for (const x of ex ?? []) seen.add(x.external_transaction_id);
        }

        const isCard = a.type === 'CREDIT';
        const rows = txs.filter((t) => !seen.has(t.id)).map((t) => {
          const credit = t.type === 'CREDIT';
          return {
            family_id: family,
            account_id: idOf.get(a.id) ?? null,
            external_transaction_id: t.id,
            description: String(t.description || t.descriptionRaw || 'Sem descrição').slice(0, 200),
            amount: Math.abs(Number(t.amount)),
            transaction_date: brDate(t.date),
            // Em cartão, crédito costuma ser pagamento de fatura ou estorno: deixa para a pessoa decidir.
            suggested_type: isCard ? (credit ? null : 'expense') : (credit ? 'income' : 'expense'),
          };
        });
        for (const part of chunk(rows, 200)) {
          const { error } = await sb.from('bank_import_review').insert(part);
          if (error) throw error;
          newTransactions += part.length;
        }
        } catch (e) {
          // Uma conta com problema (ex.: 410) não impede as outras de sincronizar.
          errors.push(`${c.institution || 'Banco'} (${c.item_id.slice(0, 8)}) · ${String(a.marketingName || a.name || 'conta').slice(0, 30)}: ${e?.message || 'erro'}`);
        }
      }

      // Nome do banco (só se ainda não houver) e data da sincronização.
      let institution = c.institution;
      if (!institution) {
        try { institution = (await pluggyGet(`/items/${encodeURIComponent(c.item_id)}`, key))?.connector?.name ?? null; } catch (_) { /* opcional */ }
      }
      await sb.from('bank_connections')
        .update({ last_synced_at: new Date().toISOString(), institution })
        .eq('id', c.id);
      } catch (e) {
        // Um banco com problema não impede a sincronização dos demais.
        errors.push(`${c.institution || 'Banco'}: ${e?.message || 'erro desconhecido'}`);
      }
    }

    return json({ accounts: newAccounts, new_transactions: newTransactions, errors });
  } catch (err) {
    return json({ error: err?.message || 'Erro inesperado na sincronização.' }, 500);
  }
});

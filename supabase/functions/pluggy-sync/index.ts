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

const norm = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Forma de pagamento deduzida dos dados do banco (Pix, TED/DOC, boleto, débito, cartão de crédito).
function payMethod(t, isCard) {
  if (isCard) return 'cartao_credito';
  const raw = norm([t.paymentData?.paymentMethod, t.operationType, t.description, t.descriptionRaw].join(' '));
  if (/\bpix\b/.test(raw)) return 'pix';
  if (/\bted\b|\bdoc\b|transfer/.test(raw)) return 'ted_doc';
  if (/boleto|titulo|cobranca/.test(raw)) return 'boleto';
  if (/saque/.test(raw)) return 'dinheiro';
  if (/debito|compra/.test(raw)) return 'cartao_debito';
  return 'outro';
}

// Sugestão de tipo de movimento (a pessoa sempre confirma na revisão).
function suggestMovement(text, aliases, isCard, credit) {
  const n = norm(text);
  if (/(pagamento|pgto|pag)\s*(de\s*)?fatura|fatura\s*(do\s*)?cart|pagamento recebido|pagamento efetuado/.test(n)) return 'card_bill';
  // Aplicação/resgate automático (ex.: BB Rende Fácil): dinheiro que só muda de lugar, não é gasto nem ganho.
  if (/rende\s*facil|aplicacao\s*automatica|resgate\s*automatico|aplic\w*\s*(em\s*|de\s*)?(auto|invest|cdb|fundo|poupanca)|resg\w*\s*(em\s*|de\s*)?(auto|invest|cdb|fundo|poupanca)|\b(apl|resg)\.?\s*aut/.test(n)) return 'investment';
  if (/doacao|dizimo|oferta/.test(n)) return 'donation';
  if (aliases.some((a) => n.includes(a))) return 'transfer';
  return null;
}

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
  if (!r.ok) {
    // Inclui o motivo informado pela Pluggy (sem dados pessoais) para facilitar o diagnóstico.
    let why = '';
    try { const j = await r.json(); why = String(j?.message || j?.code || '').slice(0, 160); } catch (_) { /* sem corpo */ }
    throw new Error(`A Pluggy respondeu ${r.status} em ${path.split('?')[0]}${why ? ': ' + why : '.'}`);
  }
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

    // Nomes que indicam transferência dentro da família (pessoas cadastradas + integrantes).
    const { data: al } = await sb.from('family_aliases').select('name').eq('family_id', family);
    const { data: mem } = await sb.from('family_members').select('display_name').eq('family_id', family).eq('active', true);
    const aliasList = [...(al ?? []).map((x) => x.name), ...(mem ?? []).map((x) => x.display_name)]
      .map(norm).map((x) => x.trim()).filter((x) => x.length >= 3);

    const key = await pluggyKey();
    let newAccounts = 0, newTransactions = 0, checkedAccounts = 0, fetchedTransactions = 0, investmentsCount = 0;
    const errors = [];
    const details = [];

    for (const c of conns) {
      try {
      const accData = await pluggyGet(`/accounts?itemId=${encodeURIComponent(c.item_id)}`, key);
      const list = accData.results ?? [];
      // Situação da conexão na Pluggy (ajuda a entender por que não chegam lançamentos).
      try {
        const it = await pluggyGet(`/items/${encodeURIComponent(c.item_id)}`, key);
        const parts = list.map((a) => `${a.type === 'CREDIT' ? 'cartão' : 'conta'} saldo ${a.balance ?? '?'}`).join(', ');
        details.push(`${c.institution || 'Banco'} (${c.item_id.slice(0, 8)}): situação ${it.status}/${it.executionStatus ?? '-'}${it.error?.code ? ' erro ' + it.error.code : ''}; ${parts}`);
      } catch (_) { details.push(`${c.institution || 'Banco'} (${c.item_id.slice(0, 8)}): situação indisponível`); }
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
        balance: a.balance ?? null,
        balance_updated_at: new Date().toISOString(),
        closing_day: dayOf(a.creditData?.balanceCloseDate),
        due_day: dayOf(a.creditData?.balanceDueDate),
        created_by: uid,
      }));
      if (fresh.length) {
        const { error } = await sb.from('financial_accounts').insert(fresh);
        if (error) throw error;
        newAccounts += fresh.length;
      }

      for (const a of list.filter((x) => haveSet.has(x.id))) {
        await sb.from('financial_accounts')
          .update({ balance: a.balance ?? null, balance_updated_at: new Date().toISOString() })
          .eq('family_id', family).eq('external_id', a.id);
      }

      const { data: mine, error: me } = await sb
        .from('financial_accounts').select('id,external_id').eq('family_id', family).in('external_id', extIds);
      if (me) throw me;
      const idOf = new Map((mine ?? []).map((x) => [x.external_id, x.id]));

      // Sempre 90 dias: lançamentos já vistos são ignorados mais abaixo, então não duplica.
      const from = isoDate(new Date(Date.now() - 90 * 864e5));
      const to = isoDate(new Date());

      for (const a of list) {
        try {
        checkedAccounts++;
        const txs = [];
        // Endpoint atual da Pluggy (o /transactions antigo foi descontinuado): paginação por cursor "next".
        let path = `/v2/transactions?accountId=${encodeURIComponent(a.id)}&dateFrom=${from}&dateTo=${to}`;
        for (let guard = 0; path && guard < 40; guard++) {
          const res = await pluggyGet(path, key);
          for (const t of res.results ?? []) if (t.status !== 'PENDING' && Number(t.amount) !== 0) txs.push(t);
          const next = res.next;
          path = next ? (String(next).startsWith('/') ? String(next) : `/v2/transactions${String(next).startsWith('?') ? '' : '?'}${next}`) : '';
        }
        fetchedTransactions += txs.length;
        details.push(`${String(a.marketingName || a.name || 'conta').slice(0, 20)} (saldo ${a.balance ?? '?'}): ${txs.length} lanç.`);
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
            payment_method: payMethod(t, isCard),
            counterparty: String(t.paymentData?.receiver?.name || t.paymentData?.payer?.name || t.merchant?.name || '').slice(0, 120) || null,
            suggested_movement: suggestMovement(`${t.description ?? ''} ${t.descriptionRaw ?? ''} ${t.paymentData?.receiver?.name ?? ''} ${t.paymentData?.payer?.name ?? ''}`, aliasList, isCard, credit),
          };
        });
        for (const part of chunk(rows, 200)) {
          const { error } = await sb.from('bank_import_review').insert(part);
          if (error) throw error;
          newTransactions += part.length;
        }
        } catch (e) {
          // Uma conta com problema (ex.: 410) não impede as outras de sincronizar.
          errors.push(`${c.institution || 'Banco'} (${c.item_id.slice(0, 8)}) · ${String(a.marketingName || a.name || 'conta').slice(0, 30)} (saldo ${a.balance ?? '?'}): ${e?.message || 'erro'}`);
        }
      }

      // Investimentos do item (não derruba a sincronização se o banco não compartilhar esse tipo de dado).
      try {
        const inv = [];
        for (let page = 1, total = 1; page <= total && page <= 10; page++) {
          const res = await pluggyGet(`/investments?itemId=${encodeURIComponent(c.item_id)}&pageSize=500&page=${page}`, key);
          total = res.totalPages ?? 1;
          inv.push(...(res.results ?? []));
        }
        const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
        const day = (v) => (v ? String(v).slice(0, 10) : null);
        const rowsInv = inv.map((i) => ({
          family_id: family,
          item_id: c.item_id,
          external_id: i.id,
          name: String(i.name || i.code || 'Investimento').slice(0, 160),
          type: i.type ?? null,
          subtype: i.subtype ?? null,
          institution: i.institution?.name ?? c.institution ?? null,
          issuer: i.issuer ?? null,
          balance: num(i.balance) ?? num(i.value) ?? 0,
          amount_invested: num(i.amountOriginal) ?? num(i.amount),
          profit: num(i.amountProfit),
          annual_rate: num(i.annualRate) ?? num(i.fixedAnnualRate),
          quantity: num(i.quantity),
          currency: i.currencyCode || 'BRL',
          due_date: day(i.dueDate),
          reference_date: day(i.date),
          updated_at: new Date().toISOString(),
        }));
        for (const part of chunk(rowsInv, 200)) {
          const { error } = await sb.from('investments').upsert(part.map((r) => ({ ...r, created_by: uid })), { onConflict: 'family_id,external_id' });
          if (error) throw error;
        }
        investmentsCount += rowsInv.length;
        // remove o que não existe mais nesse item
        const keep = rowsInv.map((r) => r.external_id);
        let del = sb.from('investments').delete().eq('family_id', family).eq('item_id', c.item_id);
        if (keep.length) del = del.not('external_id', 'in', `(${keep.join(',')})`);
        await del;
        details.push(`${c.institution || 'Banco'} (${c.item_id.slice(0, 8)}): ${rowsInv.length} investimento(s)`);
      } catch (e) {
        details.push(`${c.institution || 'Banco'} (${c.item_id.slice(0, 8)}): investimentos indisponíveis (${String(e?.message || e).slice(0, 120)})`);
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

    // Pareamento: saída numa conta e entrada de mesmo valor em outra conta da família (até 2 dias) = transferência.
    let pairedTransfers = 0;
    try {
      const { data: pend } = await sb.from('bank_import_review')
        .select('id,account_id,amount,transaction_date,suggested_type,suggested_movement')
        .eq('family_id', family).eq('review_status', 'pending').limit(2000);
      const open = (pend ?? []).filter((r) => !r.suggested_movement && r.account_id);
      const used = new Set();
      for (const d of open.filter((r) => r.suggested_type === 'expense')) {
        if (used.has(d.id)) continue;
        const m = open.find((c) => !used.has(c.id) && c.id !== d.id && c.suggested_type === 'income'
          && Number(c.amount) === Number(d.amount) && c.account_id !== d.account_id
          && Math.abs(new Date(c.transaction_date).getTime() - new Date(d.transaction_date).getTime()) <= 2 * 864e5);
        if (m) { used.add(d.id); used.add(m.id); }
      }
      if (used.size) {
        await sb.from('bank_import_review').update({ suggested_movement: 'transfer' }).in('id', [...used]);
        pairedTransfers = used.size;
      }
    } catch (_) { /* pareamento é um extra: não derruba a sincronização */ }

    return json({ investments: investmentsCount, paired_transfers: pairedTransfers, accounts: newAccounts, new_transactions: newTransactions, checked_accounts: checkedAccounts, fetched_transactions: fetchedTransactions, errors, details });
  } catch (err) {
    return json({ error: err?.message || 'Erro inesperado na sincronização.' }, 500);
  }
});

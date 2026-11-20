// Sincroniza contas e lançamentos da Pluggy (MeuPluggy) para a fila de revisão da família.
// Manual: roda com a identidade do usuário (JWT), com as regras de acesso (RLS). Agendado: segredo guardado em app_secrets + service role (verify_jwt desligado; a função valida sozinha).
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
  if (/(pagamento|pgto|pag)\s*(de\s*)?fatura|fatura\s*(do\s*)?cart|pagamento recebido|pagamento efetuado|gastos\s*cartao\s*de\s*credito|pagto\.?\s*por\s*deb|pgto\s*cartao/.test(n)) return 'card_bill';
  // Aplicação/resgate automático (ex.: BB Rende Fácil): dinheiro que só muda de lugar, não é gasto nem ganho.
  if (/rend\w*[\s.]*facil|(resgate|aplicacao)\s*(rdb|cdb|lci|lca)|aplicacao\s*automatica|resgate\s*automatico|aplic\w*\s*(em\s*|de\s*)?(auto|invest|cdb|fundo|poupanca)|resg\w*\s*(em\s*|de\s*)?(auto|invest|cdb|fundo|poupanca)|\b(apl|resg)\.?\s*aut/.test(n)) return 'investment';
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

async function syncFamily(sb, uid, displayName, family) {


    const { data: conns, error: ce } = await sb
      .from('bank_connections').select('id,item_id,institution,last_synced_at').eq('family_id', family);
    if (ce) throw ce;
    if (!conns?.length) return { error: 'Nenhum banco conectado. Use "Conectar banco" primeiro.' };

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
        owner_name: displayName,
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
        let pendingSkipped = 0;
        // Endpoint atual da Pluggy (o /transactions antigo foi descontinuado): paginação por cursor "next".
        let path = `/v2/transactions?accountId=${encodeURIComponent(a.id)}&dateFrom=${from}&dateTo=${to}`;
        for (let guard = 0; path && guard < 40; guard++) {
          const res = await pluggyGet(path, key);
          for (const t of res.results ?? []) {
            if (Number(t.amount) === 0) continue;
            // Compras de cartão ainda não confirmadas (fatura aberta) entram como pendentes; em conta corrente, pendentes são ignorados.
            if (t.status === 'PENDING') { if (a.type === 'CREDIT') { t._pending = true; txs.push(t); } else pendingSkipped++; } else txs.push(t);
          }
          const next = res.next;
          path = next ? (String(next).startsWith('/') ? String(next) : `/v2/transactions${String(next).startsWith('?') ? '' : '?'}${next}`) : '';
        }
        fetchedTransactions += txs.length;
        details.push(`${String(a.marketingName || a.name || 'conta').slice(0, 20)} [${a.subtype ?? a.type ?? '?'}${a.number ? ' ' + a.number : ''}] (saldo ${a.balance ?? '?'}): ${txs.length} lanç.${txs.filter((x) => x._pending).length ? ` (${txs.filter((x) => x._pending).length} pendentes)` : ''}${pendingSkipped ? ` (+${pendingSkipped} pendentes ignorados)` : ''}`);
        if (!txs.length) continue;

        // Não reimporta o que já está na fila de revisão (pendente, aprovado ou ignorado).
        const seen = new Map();
        for (const ids of chunk(txs.map((t) => t.id), 100)) {
          const { data: ex, error: ee } = await sb
            .from('bank_import_review').select('external_transaction_id,bank_status')
            .eq('family_id', family).in('external_transaction_id', ids);
          if (ee) throw ee;
          for (const x of ex ?? []) seen.set(x.external_transaction_id, x.bank_status);
        }
        const isCard = a.type === 'CREDIT';
        const accId = idOf.get(a.id) ?? null;

        // Cartão: compras que eram pendentes e agora foram confirmadas pelo banco (mesmo id ou id novo) viram "confirmadas" sem duplicar.
        let candidates = [];
        if (isCard && accId) {
          const { data: cp } = await sb.from('bank_import_review')
            .select('id,external_transaction_id,amount,transaction_date,description')
            .eq('family_id', family).eq('account_id', accId).eq('bank_status', 'pending');
          candidates = cp ?? [];
        }
        const key8 = (s) => norm(s).replace(/[^a-z0-9]/g, '').slice(0, 8);
        for (const t of txs) {
          if (t._pending || !isCard) continue;
          if (seen.get(t.id) === 'pending') {
            await sb.from('bank_import_review').update({ bank_status: 'posted' }).eq('family_id', family).eq('external_transaction_id', t.id);
            candidates = candidates.filter((c) => c.external_transaction_id !== t.id);
          }
        }
        const matched = new Set();
        for (const t of txs) {
          if (t._pending || !isCard || seen.has(t.id)) continue;
          const amt = Math.abs(Number(t.amount)), d = brDate(t.date), k = key8(t.description || t.descriptionRaw);
          const m = candidates.find((c) => Number(c.amount) === amt
            && Math.abs(new Date(c.transaction_date).getTime() - new Date(d).getTime()) <= 6 * 864e5
            && (key8(c.description) === k || norm(c.description).includes(k.slice(0, 6)) || norm(t.description || '').includes(key8(c.description).slice(0, 6))));
          if (!m) continue;
          candidates = candidates.filter((c) => c.id !== m.id);
          matched.add(t.id);
          await sb.from('bank_import_review').update({ external_transaction_id: t.id, bank_status: 'posted', transaction_date: d }).eq('id', m.id);
          await sb.from('transactions').update({ external_transaction_id: t.id, occurred_on: d }).eq('family_id', family).eq('external_transaction_id', m.external_transaction_id);
        }
        // Pendentes que sumiram do banco e ainda não foram aprovadas (compra cancelada): remove da fila.
        if (isCard && accId) {
          const live = new Set(txs.map((x) => x.id));
          for (const c of candidates) {
            if (!live.has(c.external_transaction_id)) {
              await sb.from('bank_import_review').delete().eq('id', c.id).eq('review_status', 'pending').eq('bank_status', 'pending');
            }
          }
        }

        const rows = txs.filter((t) => !seen.has(t.id) && !matched.has(t.id)).map((t) => {
          const credit = t.type === 'CREDIT';
          return {
            family_id: family,
            account_id: accId,
            external_transaction_id: t.id,
            bank_status: t._pending ? 'pending' : 'posted',
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

    return ({ investments: investmentsCount, paired_transfers: pairedTransfers, accounts: newAccounts, new_transactions: newTransactions, checked_accounts: checkedAccounts, fetched_transactions: fetchedTransactions, errors, details });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Modo agendado (pg_cron às 05:00 de Manaus): autorizado por segredo próprio, sincroniza todas as famílias com banco conectado.
    const cronHeader = req.headers.get('x-cron-secret');
    if (cronHeader) {
      const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      const { data: sec } = await admin.from('app_secrets').select('value').eq('name', 'cron_secret').maybeSingle();
      if (!sec?.value || sec.value !== cronHeader) return json({ error: 'Não autorizado.' }, 401);
      const { data: fams } = await admin.from('bank_connections').select('family_id');
      const out = [];
      for (const family of [...new Set((fams ?? []).map((x) => x.family_id))]) {
        const { data: m } = await admin.from('family_members').select('user_id,display_name,role')
          .eq('family_id', family).eq('active', true).order('role').limit(5);
        const owner = (m ?? []).find((x) => x.role === 'admin') ?? (m ?? [])[0];
        if (!owner) continue;
        try { const r = await syncFamily(admin, owner.user_id, owner.display_name, family); out.push({ family, new_transactions: r.new_transactions, investments: r.investments, errors: r.errors, details: r.details }); }
        catch (e) { out.push({ family, error: String(e?.message || e) }); }
      }
      return json({ cron: true, out });
    }

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
    const r = await syncFamily(sb, uid, fm.display_name, fm.family_id);
    return json(r, r.error ? 400 : 200);
  } catch (err) {
    return json({ error: err?.message || 'Erro inesperado na sincronização.' }, 500);
  }
});

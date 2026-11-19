// Gera um token curto para abrir o widget oficial da Pluggy (Pluggy Connect) dentro do app.
// Exige usuário logado. Segredos: PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET (Supabase → Edge Functions → Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2';

const PLUGGY = 'https://api.pluggy.ai';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: u, error: ue } = await sb.auth.getUser();
    if (ue || !u?.user) return json({ error: 'Não autenticado.' }, 401);

    const clientId = (Deno.env.get('PLUGGY_CLIENT_ID') ?? '').trim();
    const clientSecret = (Deno.env.get('PLUGGY_CLIENT_SECRET') ?? '').trim();
    if (!clientId || !clientSecret) return json({ error: 'Credenciais da Pluggy não configuradas no Supabase.' }, 500);

    const auth = await fetch(`${PLUGGY}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    if (!auth.ok) {
      return json({ error: `Falha ao autenticar na Pluggy (${auth.status}). Client ID: ${clientId.length} caracteres; Client Secret: ${clientSecret.length} caracteres. Confira os secrets no Supabase.` }, 502);
    }
    const { apiKey } = await auth.json();

    const tk = await fetch(`${PLUGGY}/connect_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ clientUserId: u.user.id }),
    });
    if (!tk.ok) return json({ error: `A Pluggy não liberou a conexão (${tk.status}).` }, 502);
    const { accessToken } = await tk.json();
    return json({ connectToken: accessToken });
  } catch (err) {
    return json({ error: err?.message || 'Erro inesperado.' }, 500);
  }
});

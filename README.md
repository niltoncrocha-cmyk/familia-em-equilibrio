# Família em Equilíbrio — MVP inicial

Aplicativo PWA em português para gestão financeira familiar. Identidade visual verde escuro, branco e dourado.

## O que esta primeira entrega contém
- Interface responsiva para celular e computador.
- Login e criação de conta com Supabase Auth.
- Dashboard com receitas, despesas, saldo e despesas variáveis.
- Lançamento manual de receitas e despesas.
- Cadastro de contas e cartões individuais/compartilhados.
- Orçamento por categoria, família ou integrante.
- Análise inicial dos maiores gastos por categoria.
- Estrutura SQL para notas fiscais, itens, produtos e histórico de preços.
- PWA instalável e cache básico da interface.

## Importante: estado desta versão
Esta é a fundação funcional do MVP, não a solução completa prometida. O reconhecimento de notas por IA, integração Open Finance, convite seguro de integrantes, controle de faturas/parcelas e comandos por voz ainda precisam ser implementados. O botão de criar acesso cria um usuário no Supabase Auth, mas a associação de novos integrantes exige fluxo de convite seguro, que será construído na próxima etapa. Não compartilhe a chave `service_role` no navegador.

## Configuração do Supabase
1. Crie um projeto no Supabase.
2. Abra SQL Editor e execute `supabase/schema.sql`.
3. Em Project Settings → API, copie a Project URL e a chave `anon`/publishable.
4. Abra `app.js` e substitua:
   - `COLE_AQUI_A_URL_DO_SUPABASE`
   - `COLE_AQUI_A_CHAVE_ANON_PUBLICA`
5. Publique os arquivos em um host HTTPS (por exemplo, Vercel, Netlify ou Cloudflare Pages).
6. Abra o endereço no Android e use “Adicionar à tela inicial”.

## Primeiro acesso / criação da família
1. Crie seu usuário na tela inicial e confirme o e-mail, se a confirmação estiver habilitada.
2. Entre com seu usuário.
3. No SQL Editor do Supabase, execute a chamada abaixo substituindo o nome:

```sql
select public.create_my_family('Família Rocha', 'Nilton');
```

A chamada à função precisa ser feita em contexto autenticado. A forma recomendada é adicionar, na próxima iteração, um assistente de configuração inicial no próprio app que invoque `supabase.rpc('create_my_family', ...)`. Não execute a função como `postgres` no SQL Editor, pois `auth.uid()` será nulo.

## Segurança e operação
- RLS está habilitado nas tabelas com dados familiares.
- O frontend usa somente a chave pública anon/publishable.
- Nunca exponha `service_role`.
- Configure backups no Supabase e revise políticas antes de inserir dados financeiros reais.
- Para Open Finance, contratar/selecionar um provedor autorizado e implementar consentimento, renovação, revogação e conciliação.

## Próximas entregas recomendadas
1. Assistente de criação da família e convite de Graziela e Izadora.
2. Fluxo de cartão de crédito: faturas, fechamento, vencimento e parcelas sem dupla contagem.
3. Upload seguro de notas e processamento IA com revisão humana.
4. Cadastro normalizado de produtos e comparação de preço por unidade.
5. Integração Open Finance via provedor.
6. Exportação PDF/CSV, notificações e testes de segurança.

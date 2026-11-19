/* Família em Equilíbrio — MVP inicial
 * Configure SUPABASE_URL e SUPABASE_ANON_KEY após criar o projeto Supabase.
 * Nunca coloque service_role key neste arquivo.
 */
const SUPABASE_URL = 'https://tyorbdvljblcctofbmoz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZvcNb-7G4TqCmLxqZTE04Q_9jgMShVM';
const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('COLE_AQUI') && !SUPABASE_ANON_KEY.includes('COLE_AQUI');
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const today = () => new Date().toISOString().slice(0,10);
const month = () => today().slice(0,7);
const monthName = new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date());
let client=null, session=null, family=null, members=[], categories=[], accounts=[], transactions=[], budgets=[], connections=[], reviews=[], aliases=[], history=[];
const fallbackCategories = [
 ['Moradia','expense','fixed'],['Alimentação','expense','variable'],['Supermercado','expense','variable'],['Restaurantes e delivery','expense','variable'],['Transporte e combustível','expense','variable'],['Saúde e farmácia','expense','variable'],['Educação','expense','fixed'],['Lazer','expense','variable'],['Vestuário','expense','variable'],['Assinaturas','expense','fixed'],['Contas da casa','expense','fixed'],['Impostos e taxas','expense','fixed'],['Outros gastos','expense','variable'],['Salário','income','income'],['Renda extra','income','income'],['Investimentos e rendimentos','income','income'],['Outras receitas','income','income']
];
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),Math.max(2600,msg.length*70))}
function message(id,msg){$(id).textContent=msg}
function showAuth(){ $('authView').classList.remove('hidden');$('appView').classList.add('hidden'); if(!configured)$('configNotice').classList.remove('hidden') }
function showApp(){ $('authView').classList.add('hidden');$('appView').classList.remove('hidden');$('monthLabel').textContent=monthName; }
function openDialog(id){$(id).showModal()}
function closeDialog(id){$(id).close()}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
function navigate(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(page+'Page').classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$('pageTitle').textContent=({dashboard:'Visão geral',transactions:'Lançamentos',cards:'Contas e cartões',budgets:'Orçamentos',insights:'Vilões financeiros',family:'Família'})[page]||'Visão geral';if(page==='insights')renderInsights()}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));
$('quickAdd').onclick=$('newTransaction').onclick=()=>{prepareTransactionForm();openDialog('transactionDialog')};$('newAccount').onclick=()=>{prepareMemberSelect('accountOwner');openDialog('accountDialog')};$('newBudget').onclick=()=>{prepareBudgetForm();openDialog('budgetDialog')};$('logoutBtn').onclick=async()=>{if(client)await client.auth.signOut();session=null;showAuth()};
$('authForm').addEventListener('submit',async e=>{e.preventDefault();if(!configured){message('authMessage','Configure primeiro a URL e a chave pública do Supabase no app.js.');return}const {data,error}=await client.auth.signInWithPassword({email:$('authEmail').value,password:$('authPassword').value});if(error){message('authMessage',error.message);return}session=data.session;await boot()});
$('signupBtn').onclick=async()=>{if(!configured){message('authMessage','Configure primeiro a URL e a chave pública do Supabase no app.js.');return}const {data,error}=await client.auth.signUp({email:$('authEmail').value,password:$('authPassword').value});if(error){message('authMessage',error.message);return}message('authMessage',data.session?'Acesso criado. Entre para continuar.':'Acesse seu e-mail para confirmar o cadastro e depois entre.');};
async function boot(){showApp();$('sideUser').textContent=session.user.email;try{await loadFamily();await loadAll()}catch(e){toast('Não foi possível carregar os dados: '+e.message)}}
async function loadFamily(){let {data,error}=await client.from('family_members').select('family_id,role,display_name').eq('user_id',session.user.id).eq('active',true).maybeSingle();if(error)throw error;if(!data){$('familyInfo').innerHTML='<p class="muted">Seu usuário ainda não está vinculado a uma família. Execute a função de configuração inicial descrita no README ou peça ao administrador para concluir o cadastro.</p>';return}family=data.family_id;}
async function loadAll(){if(!family){renderFamily();return}const [m,c,a,t,b,cn,rv,al,hs]=await Promise.all([
 client.from('family_members').select('user_id,display_name,role').eq('family_id',family).eq('active',true),
 client.from('categories').select('*').or(`family_id.eq.${family},family_id.is.null`).order('name'),
 client.from('financial_accounts').select('*').eq('family_id',family).eq('active',true).order('name'),
 client.from('transactions').select('*,categories!transactions_category_id_fkey(name,kind),family_members!transactions_family_member_fkey(display_name),financial_accounts!transactions_account_id_fkey(name)').eq('family_id',family).order('occurred_on',{ascending:false}).limit(500),
 client.from('budgets').select('*,categories(name)').eq('family_id',family).eq('month',month()+'-01'),
 client.from('bank_connections').select('id,institution,last_synced_at').eq('family_id',family).order('created_at'),
 client.from('bank_import_review').select('*').eq('family_id',family).eq('review_status','pending').order('transaction_date',{ascending:false}).limit(200),
 client.from('family_aliases').select('id,name').eq('family_id',family).order('name'),
 client.from('transactions').select('description,counterparty,amount,type,category_id,movement_kind,occurred_on,source').eq('family_id',family).order('occurred_on',{ascending:false}).limit(3000)
 ]);for(const r of [m,c,a,t,b])if(r.error)throw r.error;members=m.data||[];categories=c.data||[];accounts=a.data||[];transactions=t.data||[];budgets=b.data||[];connections=cn.error?[]:(cn.data||[]);reviews=rv.error?[]:(rv.data||[]);aliases=al.error?[]:(al.data||[]);history=hs.error?[]:(hs.data||[]);renderAll()}
function renderAll(){renderAliases();renderDashboard();renderTransactions();renderAccounts();renderBudgets();renderFamily();fillCategories();renderBank()}
const PM={pix:'Pix',cartao_credito:'Cartão de crédito',cartao_debito:'Cartão de débito',boleto:'Boleto',ted_doc:'TED/DOC',dinheiro:'Dinheiro',outro:'Outro'};
const KIND={normal:'Despesa ou receita normal',transfer:'Transferência entre contas da família',card_bill:'Pagamento de fatura do cartão',donation:'Doação / oferta (conta como despesa)'};
const catName=t=>t.categories?.name||((t.movement_kind||'normal')==='donation'?'Doações e ofertas':'Sem categoria');
// Entram em receitas, despesas, orçamento e vilões: movimentos normais e doações. Transferências entre contas da família e pagamentos de fatura ficam à parte.
function monthTx(){return transactions.filter(t=>String(t.occurred_on).slice(0,7)===month()&&['normal','donation'].includes(t.movement_kind||'normal'))}
function renderDashboard(){const ts=monthTx(),income=ts.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0),expense=ts.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0),variable=ts.filter(t=>t.type==='expense'&&t.cost_behavior!=='fixed').reduce((s,t)=>s+Number(t.amount),0);const other=transactions.filter(t=>String(t.occurred_on).slice(0,7)===month()&&['transfer','card_bill'].includes(t.movement_kind)),sumK=(k,ty)=>other.filter(t=>t.movement_kind===k&&(!ty||t.type===ty)).reduce((s,t)=>s+Number(t.amount),0),parts=[];if(other.some(t=>t.movement_kind==='transfer'))parts.push(`Transferências entre contas da família: saíram ${money(sumK('transfer','expense'))} e entraram ${money(sumK('transfer','income'))}`);if(sumK('card_bill'))parts.push(`Faturas de cartão pagas: ${money(sumK('card_bill'))}`);if($('otherMovements'))$('otherMovements').textContent=parts.length?'Fora de receitas e despesas: '+parts.join(' · '):'';
$('incomeTotal').textContent=money(income);$('expenseTotal').textContent=money(expense);$('balanceTotal').textContent=money(income-expense);$('balanceTotal').className=income-expense>=0?'positive':'negative';$('variableTotal').textContent=money(variable);
 const groups={};ts.filter(t=>t.type==='expense').forEach(t=>{let n=catName(t);groups[n]=(groups[n]||0)+Number(t.amount)});const sorted=Object.entries(groups).sort((a,b)=>b[1]-a[1]);$('categoryBreakdown').innerHTML=sorted.length?sorted.slice(0,7).map(([n,v])=>`<div class="bar-row"><span>${esc(n)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,v/Math.max(...sorted.map(x=>x[1]))*100)}%"></div></div><strong>${money(v)}</strong></div>`).join(''):'Ainda não há lançamentos neste mês.';
 const recent=ts.slice(0,6);$('recentList').innerHTML=recent.length?recent.map(txRow).join(''):'Nenhum lançamento registrado.';const target=variable*.2;$('assistantSummary').textContent=variable?`Até agora, as despesas variáveis somam ${money(variable)}. A referência de economia de 20% representa ${money(target)}. Continue registrando as compras para identificar oportunidades reais.`:'Assim que houver movimentações, mostraremos os principais gastos, variações e oportunidades de economia.'}
function txRow(t){return `<div class="tx-row"><div><strong>${esc(t.description)}</strong><small>${esc(t.categories?.name||'Sem categoria')} · ${esc(memberName(t.member_user_id))} · ${formatDate(t.occurred_on)}</small></div><strong class="${t.type==='income'?'positive':'negative'}">${t.type==='income'?'+':'−'} ${money(t.amount)}</strong></div>`}
function renderTransactions(){const q=($('searchTransactions')?.value||'').toLowerCase(),f=$('typeFilter')?.value||'all';const isKind=['transfer','card_bill','donation'].includes(f);const list=transactions.filter(t=>(f==='all'||(isKind?t.movement_kind===f:(t.type===f&&['normal','donation'].includes(t.movement_kind||'normal'))))&&(`${t.description} ${t.categories?.name||''}`).toLowerCase().includes(q));$('transactionsList').innerHTML=list.length?`<table class="data-table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Responsável</th><th>Pagamento</th><th>Valor</th></tr></thead><tbody>${list.map(t=>`<tr><td>${formatDate(t.occurred_on)}</td><td>${esc(t.description)}${(t.movement_kind||'normal')!=='normal'?`<br><small class="muted">${esc(KIND[t.movement_kind])}</small>`:''}</td><td>${esc(t.categories?.name||'—')}</td><td>${esc(t.family_members?.display_name||'—')}</td><td>${esc(t.payment_method?PM[t.payment_method]||t.payment_method:'—')}<br><small class="muted">${esc(t.financial_accounts?.name||'')}</small></td><td class="${t.type==='income'?'positive':'negative'}">${money(t.amount)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">Nenhum lançamento encontrado.</div>'}
function renderAccounts(){$('accountsList').innerHTML=accounts.length?accounts.map(a=>`<article class="account-card"><div class="type-icon">${a.account_type==='credit_card'?'▤':'◫'}</div><h3>${esc(a.name)}</h3><p>${a.account_type==='credit_card'?'Cartão de crédito':a.account_type==='debit_card'?'Cartão de débito':a.account_type==='bank_account'?'Conta bancária':a.account_type==='pix'?'Pix':'Dinheiro'} · ${a.scope==='shared'?'Compartilhado':'Individual'}</p><p>${esc(a.owner_name||'Uso familiar')}${a.credit_limit?` · Limite ${money(a.credit_limit)}`:''}</p>${a.balance!=null?`<p><strong>${a.account_type==='credit_card'?'Em aberto':'Saldo'}: ${money(a.balance)}</strong>${a.balance_updated_at?` <small class="muted">· ${new Date(a.balance_updated_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small>`:''}</p>`:''}</article>`).join(''):'<div class="panel empty-state">Nenhuma conta ou cartão cadastrado. Adicione os meios de pagamento utilizados pela família.</div>'}
function renderBudgets(){const spend=monthTx().filter(t=>t.type==='expense');$('budgetsList').innerHTML=budgets.length?budgets.map(b=>{const used=spend.filter(t=>t.category_id===b.category_id&&(!b.member_user_id||t.member_user_id===b.member_user_id)).reduce((s,t)=>s+Number(t.amount),0),pct=Math.min(100,used/Number(b.amount)*100);return `<div class="budget-item"><div class="budget-meta"><div><strong>${esc(b.categories?.name||'Categoria')}</strong><br><small>${esc(b.member_user_id?memberName(b.member_user_id):'Família inteira')}</small></div><div><strong>${money(used)} / ${money(b.amount)}</strong></div></div><div class="budget-progress"><span style="width:${pct}%;background:${pct>=100?'#b64d43':pct>=80?'#c5a45b':'#1d5a43'}"></span></div></div>`}).join(''):'<div class="panel empty-state">Defina limites para acompanhar o orçamento familiar.</div>'}
function renderInsights(){const spend=monthTx().filter(t=>t.type==='expense'),groups={};spend.forEach(t=>{const n=catName(t);groups[n]=(groups[n]||0)+Number(t.amount)});const sorted=Object.entries(groups).sort((a,b)=>b[1]-a[1]);$('insightsContent').innerHTML=sorted.length?`<h3>Maiores categorias de despesas</h3>${sorted.map(([n,v],i)=>`<div class="tx-row"><div><strong>${i+1}. ${esc(n)}</strong><small>${spend.length?Math.round(v/spend.reduce((s,t)=>s+Number(t.amount),0)*100):0}% das despesas</small></div><strong>${money(v)}</strong></div>`).join('')}`:'Registre despesas para começarmos a identificar os maiores gastos.'}
function renderFamily(){if(!family){$('familyInfo').innerHTML='<div class="notice">Antes de usar o painel, crie o núcleo familiar. Depois, na próxima etapa, adicionaremos o convite seguro de Graziela e Izadora.</div><form id="createFamilyForm" class="form-grid"><label>Nome da família<input id="familyName" required value="Família Rocha"></label><label>Seu nome<input id="familyDisplayName" required value="" placeholder="Seu nome"></label><div class="span-2"><button class="primary" type="submit">Criar núcleo familiar</button></div></form>';const form=$('createFamilyForm');form.onsubmit=async e=>{e.preventDefault();const {error}=await client.rpc('create_my_family',{family_name:$('familyName').value,my_display_name:$('familyDisplayName').value});if(error){toast(error.message);return}await loadFamily();await loadAll();toast('Núcleo familiar criado.')};return;} $('familyInfo').innerHTML=members.length?members.map(m=>`<div class="family-member"><div class="avatar">${esc((m.display_name||'?').slice(0,1).toUpperCase())}</div><div><strong>${esc(m.display_name||'Integrante')}</strong><br><small class="muted">${m.role==='owner'?'Administrador familiar':m.role==='admin'?'Administrador':'Integrante'}</small></div></div>`).join(''):'<p class="muted">Nenhum integrante vinculado.</p>'}
function fillCategories(){const expense=categories.filter(c=>c.kind==='expense');const income=categories.filter(c=>c.kind==='income');$('txCategory').innerHTML=catOptions($('txType').value);$('budgetCategory').innerHTML=expense.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}
function prepareMemberSelect(id,includeFamily=false){$(id).innerHTML=(includeFamily?'<option value="">Família inteira</option>':'')+members.map(m=>`<option value="${m.user_id}">${esc(m.display_name)}</option>`).join('')}
function prepareTransactionForm(){$('txDate').value=today();$('txAmount').value='';$('txDescription').value='';$('txNotes').value='';prepareMemberSelect('txMember');$('txAccount').innerHTML='<option value="">Não informado</option>'+accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');$('txKind').value='normal';$('txMethod').value='';fillCategories()}
function prepareBudgetForm(){$('budgetMonth').value=month();prepareMemberSelect('budgetMember',true);fillCategories()}
$('txType').onchange=()=>{$('txCategory').innerHTML=catOptions($('txType').value)};
$('transactionForm').onsubmit=async e=>{e.preventDefault();try{const category=categories.find(c=>c.id===$('txCategory').value);const payload={family_id:family,type:$('txType').value,amount:Number($('txAmount').value),description:$('txDescription').value.trim(),category_id:$('txCategory').value||null,occurred_on:$('txDate').value,member_user_id:$('txMember').value||session.user.id,account_id:$('txAccount').value||null,notes:$('txNotes').value.trim()||null,cost_behavior:category?.cost_behavior||'variable',created_by:session.user.id,movement_kind:$('txKind').value,payment_method:$('txMethod').value||null};if(payload.movement_kind!=='normal')payload.category_id=null;const {error}=await client.from('transactions').insert(payload);if(error)throw error;closeDialog('transactionDialog');await loadAll();toast('Lançamento salvo com sucesso.')}catch(err){message('txMessage',err.message)}};
$('accountForm').onsubmit=async e=>{e.preventDefault();try{const owner=members.find(m=>m.user_id===$('accountOwner').value);const {error}=await client.from('financial_accounts').insert({family_id:family,name:$('accountName').value.trim(),account_type:$('accountType').value,owner_user_id:owner?.user_id||null,owner_name:owner?.display_name||null,scope:$('accountScope').value,credit_limit:Number($('accountLimit').value)||null,created_by:session.user.id});if(error)throw error;closeDialog('accountDialog');await loadAll();toast('Conta ou cartão cadastrado.')}catch(err){message('accountMessage',err.message)}};
$('budgetForm').onsubmit=async e=>{e.preventDefault();try{const budgetPayload={family_id:family,category_id:$('budgetCategory').value,amount:Number($('budgetAmount').value),member_user_id:$('budgetMember').value||null,month:$('budgetMonth').value+'-01',created_by:session.user.id};let existingQuery=client.from('budgets').select('id').eq('family_id',family).eq('category_id',budgetPayload.category_id).eq('month',budgetPayload.month);existingQuery=budgetPayload.member_user_id?existingQuery.eq('member_user_id',budgetPayload.member_user_id):existingQuery.is('member_user_id',null);const {data:existing,error:findError}=await existingQuery.maybeSingle();if(findError)throw findError;const result=existing?.id?await client.from('budgets').update({amount:budgetPayload.amount}).eq('id',existing.id):await client.from('budgets').insert(budgetPayload);if(result.error)throw result.error;closeDialog('budgetDialog');await loadAll();toast('Limite de orçamento salvo.')}catch(err){message('budgetMessage',err.message)}};
$('searchTransactions').oninput=renderTransactions;$('typeFilter').onchange=renderTransactions;
function memberName(id){return members.find(m=>m.user_id===id)?.display_name||'Integrante'}
function formatDate(d){return new Intl.DateTimeFormat('pt-BR').format(new Date(d+'T12:00:00'))}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
/* ---- Conexão bancária (MeuPluggy / Pluggy) ---- */
function accountName(id){return accounts.find(a=>a.id===id)?.name||'Conta importada'}
function catOptions(type,sel){return categories.filter(c=>c.kind===(type==='income'?'income':'expense')).map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${esc(c.name)}</option>`).join('')+'<option value="__new__">＋ Nova categoria…</option>'}

// Aprendizado pelo histórico: lançamentos parecidos já classificados sugerem categoria e tipo de movimento.
const STOP=new Set(['pix','compra','cartao','debito','credito','pagamento','pgto','transferencia','transf','recebida','recebido','enviada','enviado','com','para','por','ltda','eireli','sa','the','nubank','bradesco']);
function words(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w))}
let learnMap=null,learnSize=-1;
function learn(){if(learnMap&&learnSize===history.length)return learnMap;learnMap={};learnSize=history.length;
  for(const h of history){const cat=h.category_id||null,kind=h.movement_kind||'normal';if(!cat&&kind==='normal')continue;
    const w=words(h.description);
    for(let n=1;n<=3&&n<=w.length;n++){const k=n+':'+w.slice(0,n).join(' ');const e=learnMap[k]||(learnMap[k]={n:0,cats:{},kinds:{}});e.n++;if(cat)e.cats[cat]=(e.cats[cat]||0)+1;e.kinds[kind]=(e.kinds[kind]||0)+1}}
  return learnMap}
function suggestFor(r){const m=learn();const w=words(r.description);
  for(let n=Math.min(3,w.length);n>=1;n--){const e=m[n+':'+w.slice(0,n).join(' ')];if(!e||(n===1&&(e.n<2||w[0].length<5)))continue;
    const top=o=>Object.entries(o).sort((x,y)=>y[1]-x[1])[0];const c=top(e.cats),k=top(e.kinds);
    return {cat:c?c[0]:null,kind:k?k[0]:'normal',count:e.n}}
  return null}
// Aviso de duplicidade: lançamento manual (ou de nota) com mesmo valor e data próxima (até 2 dias).
function dupOf(r){const t=r.suggested_type||'expense';return history.find(h=>h.source!=='bank_import'&&h.type===t&&Number(h.amount)===Number(r.amount)&&Math.abs(new Date(h.occurred_on)-new Date(r.transaction_date))<=2*864e5)}
function renderBank(){
  const list=$('connectionsList');if(!list)return;
  list.innerHTML=connections.length?connections.map(c=>`<div class="tx-row"><div><strong>${esc(c.institution||'Banco conectado')}</strong><small>${c.last_synced_at?'Última sincronização: '+esc(new Date(c.last_synced_at).toLocaleString('pt-BR')):'Ainda não sincronizado'}</small></div></div>`).join(''):'<p class="muted">Nenhum banco conectado ainda.</p>';
  $('syncBank').disabled=!connections.length;
  $('reviewList').innerHTML=reviews.length?reviews.map(r=>{const type=r.suggested_type||'expense',sug=suggestFor(r),dup=dupOf(r);
    const kind=r.suggested_movement||(sug&&sug.kind)||'normal';const catOk=sug&&sug.cat&&categories.some(c=>c.id===sug.cat&&c.kind===(type==='income'?'income':'expense'))?sug.cat:null;
    return `<div class="tx-row" data-review="${r.id}" style="flex-wrap:wrap;gap:8px${dup?';border-left:3px solid #c5a45b;padding-left:8px':''}"><div><strong>${esc(r.description)}</strong><small>${formatDate(r.transaction_date)} · ${esc(accountName(r.account_id))}${r.payment_method?' · '+esc(PM[r.payment_method]||r.payment_method):''}${r.counterparty?' · '+esc(r.counterparty):''}</small></div><strong class="${type==='income'?'positive':'negative'}">${money(r.amount)}</strong>
      ${dup?`<div class="notice" style="width:100%;margin:0">⚠ Possível duplicado: já existe “${esc(dup.description)}” de ${money(dup.amount)} em ${formatDate(dup.occurred_on)}, lançado por você. Se for a mesma despesa, toque em <strong>Ignorar</strong>.</div>`:''}
      ${sug&&(catOk||kind!=='normal')&&!r.suggested_movement?`<small class="muted" style="width:100%">Sugerido pelo histórico (${sug.count} lançamento${sug.count>1?'s':''} parecido${sug.count>1?'s':''}).</small>`:''}
      <div class="button-row" style="width:100%"><select class="rv-type"><option value="expense"${type==='expense'?' selected':''}>Despesa</option><option value="income"${type==='income'?' selected':''}>Receita</option></select><select class="rv-kind">${Object.entries(KIND).map(([k,v])=>`<option value="${k}"${kind===k?' selected':''}>${v}</option>`).join('')}</select><select class="rv-cat"${kind!=='normal'?' style="display:none"':''}>${catOptions(type,catOk)}</select><button class="primary compact" type="button" data-act="approve">Aprovar</button><button class="secondary compact" type="button" data-act="reject">Ignorar</button></div></div>`}).join(''):'<div class="empty-state">Nenhum lançamento aguardando revisão.</div>';
}
async function approveReview(row){
  const r=reviews.find(x=>x.id===row.dataset.review);if(!r)return;
  const type=row.querySelector('.rv-type').value,kind=row.querySelector('.rv-kind').value,catId=kind==='normal'?row.querySelector('.rv-cat').value:'',category=categories.find(c=>c.id===catId);
  const {error}=await client.from('transactions').insert({family_id:family,type,amount:Number(r.amount),description:r.description,category_id:catId||null,occurred_on:r.transaction_date,member_user_id:session.user.id,account_id:r.account_id,cost_behavior:category?.cost_behavior||(type==='income'?'income':'variable'),source:'bank_import',movement_kind:kind,payment_method:r.payment_method||null,counterparty:r.counterparty||null,external_transaction_id:r.external_transaction_id,created_by:session.user.id});
  if(error)throw error;
  const {error:e2}=await client.from('bank_import_review').update({review_status:'approved',final_type:type,final_movement:kind,final_category_id:catId||null,reviewed_by:session.user.id,reviewed_at:new Date().toISOString()}).eq('id',r.id);
  if(e2)throw e2;
  await loadAll();toast('Lançamento aprovado.');
}
async function rejectReview(row){
  const {error}=await client.from('bank_import_review').update({review_status:'rejected',reviewed_by:session.user.id,reviewed_at:new Date().toISOString()}).eq('id',row.dataset.review);
  if(error)throw error;
  await loadAll();toast('Lançamento ignorado.');
}
$('reviewList').addEventListener('click',async e=>{const b=e.target.closest('button[data-act]');if(!b)return;const row=b.closest('[data-review]');b.disabled=true;try{await(b.dataset.act==='approve'?approveReview(row):rejectReview(row))}catch(err){toast(err.message);b.disabled=false}});
$('reviewList').addEventListener('change',e=>{const row=e.target.closest('[data-review]');if(e.target.classList.contains('rv-type'))row.querySelector('.rv-cat').innerHTML=catOptions(e.target.value,null);if(e.target.classList.contains('rv-kind'))row.querySelector('.rv-cat').style.display=e.target.value==='normal'?'':'none'});
$('connectManual').onclick=()=>{$('itemId').value='';$('itemName').value='';message('connectMessage','');openDialog('connectDialog')};
$('connectForm').onsubmit=async e=>{e.preventDefault();try{const item=$('itemId').value.trim();if(!/^[0-9a-f-]{36}$/i.test(item))throw new Error('Item ID inválido. Copie o código novamente no app de demonstração da Pluggy.');const {error}=await client.from('bank_connections').insert({family_id:family,provider:'pluggy',item_id:item,institution:$('itemName').value.trim()||null,created_by:session.user.id});if(error)throw error;closeDialog('connectDialog');await loadAll();toast('Banco conectado. Toque em Sincronizar agora.')}catch(err){message('connectMessage',err.message)}};
$('syncBank').onclick=async()=>{const btn=$('syncBank');btn.disabled=true;btn.textContent='Sincronizando…';$('syncResult').textContent='';try{const {data,error}=await client.functions.invoke('pluggy-sync');if(error){let msg=error.message;try{const j=await error.context.json();msg=j.error||msg}catch(_){}throw new Error(msg)}await loadAll();
  const when=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  $('syncResult').textContent=[`Última sincronização às ${when}: ${data.new_transactions} novos lançamentos para revisar; a Pluggy devolveu ${data.fetched_transactions} lançamentos em ${data.checked_accounts} contas.`,...(data.errors||[]).map(x=>'⚠ '+x),...(data.details||[]).map(x=>'• '+x)].join('\n');
  toast(`Sincronizado: ${data.new_transactions} novos lançamentos para revisar.`+(data.errors?.length?' Há avisos abaixo.':''))}catch(err){$('syncResult').textContent='⚠ '+err.message;toast(err.message)}finally{btn.textContent='Sincronizar agora';btn.disabled=!connections.length}};
if(configured&&window.supabase){client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);client.auth.getSession().then(({data})=>{if(data.session){session=data.session;boot()}else showAuth()});client.auth.onAuthStateChange((_event,s)=>{if(s){session=s;boot()}else showAuth()})}else showAuth();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

// Conexão online: abre o widget oficial da Pluggy (escolher banco, entrar e autorizar no próprio widget).
$('connectBank').onclick=async()=>{const btn=$('connectBank');btn.disabled=true;try{
  if(typeof PluggyConnect==='undefined')throw new Error('O widget da Pluggy não carregou. Verifique a internet e tente de novo.');
  const {data,error}=await client.functions.invoke('pluggy-connect-token');
  if(error){let msg=error.message;try{const j=await error.context.json();msg=j.error||msg}catch(_){}throw new Error(msg)}
  const widget=new PluggyConnect({connectToken:data.connectToken,includeSandbox:false,
    onSuccess:async({item})=>{try{
      const {error:ie}=await client.from('bank_connections').insert({family_id:family,provider:'pluggy',item_id:item.id,institution:item.connector?.name||null,created_by:session.user.id});
      if(ie&&ie.code!=='23505')throw ie;
      await loadAll();toast('Banco conectado. Toque em Sincronizar agora.')}catch(err){toast(err.message)}},
    onError:err=>toast(err?.message||'Não foi possível conectar o banco.')});
  await widget.init()}catch(err){toast(err.message)}finally{btn.disabled=false}};
// Instalação como app (Android/Chrome): mostra o botão quando o navegador permitir.
let installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;$('installApp').classList.remove('hidden')});
$('installApp').onclick=async()=>{if(!installEvt)return;installEvt.prompt();await installEvt.userChoice;installEvt=null;$('installApp').classList.add('hidden')};
window.addEventListener('appinstalled',()=>$('installApp').classList.add('hidden'));

// Nomes de pessoas da família para reconhecer transferências (ex.: Graziela).
function renderAliases(){const el=$('aliasList');if(!el)return;el.innerHTML=aliases.length?aliases.map(x=>`<div class="tx-row"><div><strong>${esc(x.name)}</strong></div><button class="text-button" type="button" data-alias-del="${x.id}">Remover</button></div>`).join(''):'<p class="muted tiny">Nenhum nome extra cadastrado.</p>'}
$('aliasForm').onsubmit=async e=>{e.preventDefault();try{const name=$('aliasName').value.trim();const {error}=await client.from('family_aliases').insert({family_id:family,name,created_by:session.user.id});if(error)throw error;$('aliasName').value='';await loadAll();toast('Nome adicionado.')}catch(err){toast(err.message)}};
$('aliasList').addEventListener('click',async e=>{const b=e.target.closest('[data-alias-del]');if(!b)return;const {error}=await client.from('family_aliases').delete().eq('id',b.dataset.aliasDel);if(error)return toast(error.message);await loadAll()});

// Criar categoria na hora da classificação (opção "＋ Nova categoria…" no seletor de categoria).
let catTarget=null,catSaved=false;
document.addEventListener('change',e=>{const s=e.target;if(!s.matches||!s.matches('.rv-cat,#txCategory')||s.value!=='__new__')return;
  catTarget=s;catSaved=false;const type=s.id==='txCategory'?$('txType').value:s.closest('[data-review]').querySelector('.rv-type').value;
  $('catKind').value=type==='income'?'income':'expense';$('catName').value='';$('catBehavior').value='variable';$('catBehaviorWrap').style.display=type==='income'?'none':'';message('catMessage','');openDialog('catDialog')});
$('catKind').onchange=()=>{$('catBehaviorWrap').style.display=$('catKind').value==='income'?'none':''};
$('catDialog').addEventListener('close',()=>{if(!catSaved&&catTarget)catTarget.selectedIndex=0});
$('catForm').onsubmit=async e=>{e.preventDefault();try{
  const name=$('catName').value.trim();if(name.length<2)throw new Error('Digite o nome da categoria.');
  const kind=$('catKind').value;
  if(categories.some(c=>c.kind===kind&&c.name.toLowerCase()===name.toLowerCase()))throw new Error('Já existe uma categoria com esse nome.');
  const {data,error}=await client.from('categories').insert({family_id:family,name,kind,cost_behavior:kind==='income'?'income':$('catBehavior').value}).select().single();
  if(error)throw new Error(error.code==='42501'?'Só o administrador da família pode criar categorias.':error.message);
  categories.push(data);catSaved=true;
  // atualiza todos os seletores abertos sem perder o que já foi escolhido nos outros itens
  document.querySelectorAll('.rv-cat').forEach(sel=>{const cur=sel===catTarget?data.id:sel.value;const t=sel.closest('[data-review]').querySelector('.rv-type').value;sel.innerHTML=catOptions(t);if([...sel.options].some(o=>o.value===cur))sel.value=cur});
  const tx=$('txCategory'),curTx=tx===catTarget?data.id:tx.value;tx.innerHTML=catOptions($('txType').value);if([...tx.options].some(o=>o.value===curTx))tx.value=curTx;
  $('budgetCategory').innerHTML=categories.filter(c=>c.kind==='expense').map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  closeDialog('catDialog');toast('Categoria criada: '+name)}catch(err){message('catMessage',err.message)}};

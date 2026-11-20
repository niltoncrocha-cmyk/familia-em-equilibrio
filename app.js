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
let client=null, session=null, family=null, members=[], categories=[], accounts=[], transactions=[], budgets=[], connections=[], reviews=[], aliases=[], history=[], investments=[];
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
function navigate(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(page+'Page').classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$('pageTitle').textContent=({dashboard:'Visão geral',transactions:'Lançamentos',cards:'Contas e cartões',budgets:'Orçamentos',insights:'Vilões financeiros',investments:'Investimentos',months:'Meses e comparativo',family:'Família'})[page]||'Visão geral';if(page==='insights')renderInsights()}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));
$('quickAdd').onclick=$('newTransaction').onclick=()=>{prepareTransactionForm();openDialog('transactionDialog')};$('newAccount').onclick=()=>{prepareMemberSelect('accountOwner');openDialog('accountDialog')};$('newBudget').onclick=()=>{prepareBudgetForm();openDialog('budgetDialog')};$('logoutBtn').onclick=async()=>{if(client)await client.auth.signOut();session=null;showAuth()};
$('authForm').addEventListener('submit',async e=>{e.preventDefault();if(!configured){message('authMessage','Configure primeiro a URL e a chave pública do Supabase no app.js.');return}const {data,error}=await client.auth.signInWithPassword({email:$('authEmail').value,password:$('authPassword').value});if(error){message('authMessage',error.message);return}session=data.session;await boot()});
$('signupBtn').onclick=async()=>{if(!configured){message('authMessage','Configure primeiro a URL e a chave pública do Supabase no app.js.');return}const {data,error}=await client.auth.signUp({email:$('authEmail').value,password:$('authPassword').value});if(error){message('authMessage',error.message);return}message('authMessage',data.session?'Acesso criado. Entre para continuar.':'Acesse seu e-mail para confirmar o cadastro e depois entre.');};
async function boot(){showApp();$('sideUser').textContent=session.user.email;try{await loadFamily();await loadAll()}catch(e){toast('Não foi possível carregar os dados: '+e.message)}}
async function loadFamily(){let {data,error}=await client.from('family_members').select('family_id,role,display_name').eq('user_id',session.user.id).eq('active',true).maybeSingle();if(error)throw error;if(!data){$('familyInfo').innerHTML='<p class="muted">Seu usuário ainda não está vinculado a uma família. Execute a função de configuração inicial descrita no README ou peça ao administrador para concluir o cadastro.</p>';return}family=data.family_id;}
async function loadAll(){if(!family){renderFamily();return}const [m,c,a,t,b,cn,rv,al,hs,iv]=await Promise.all([
 client.from('family_members').select('user_id,display_name,role').eq('family_id',family).eq('active',true),
 client.from('categories').select('*').or(`family_id.eq.${family},family_id.is.null`).order('name'),
 client.from('financial_accounts').select('*').eq('family_id',family).eq('active',true).order('name'),
 client.from('transactions').select('*,categories!transactions_category_id_fkey(name,kind),family_members!transactions_family_member_fkey(display_name),financial_accounts!transactions_account_id_fkey(name)').eq('family_id',family).order('occurred_on',{ascending:false}).limit(500),
 client.from('budgets').select('*,categories(name)').eq('family_id',family).eq('month',month()+'-01'),
 client.from('bank_connections').select('id,institution,last_synced_at').eq('family_id',family).order('created_at'),
 client.from('bank_import_review').select('*').eq('family_id',family).eq('review_status','pending').order('transaction_date',{ascending:false}).limit(200),
 client.from('family_aliases').select('id,name').eq('family_id',family).order('name'),
 client.from('transactions').select('id,account_id,description,counterparty,amount,type,category_id,movement_kind,occurred_on,source').eq('family_id',family).order('occurred_on',{ascending:false}).limit(3000),
 client.from('investments').select('*').eq('family_id',family).order('balance',{ascending:false})
 ]);for(const r of [m,c,a,t,b])if(r.error)throw r.error;members=m.data||[];categories=c.data||[];accounts=a.data||[];transactions=t.data||[];budgets=b.data||[];connections=cn.error?[]:(cn.data||[]);reviews=rv.error?[]:(rv.data||[]);aliases=al.error?[]:(al.data||[]);history=hs.error?[]:(hs.data||[]);investments=iv.error?[]:(iv.data||[]);renderAll()}
function renderAll(){snapshotInvestments();autoSync();renderMonths();renderWealth();renderInvestments();renderAliases();renderDashboard();renderTransactions();renderAccounts();renderBudgets();renderFamily();fillCategories();renderBank()}
const PM={pix:'Pix',cartao_credito:'Cartão de crédito',cartao_debito:'Cartão de débito',boleto:'Boleto',ted_doc:'TED/DOC',dinheiro:'Dinheiro',outro:'Outro'};
const KIND={normal:'Despesa ou receita normal',transfer:'Transferência entre contas da família',card_bill:'Pagamento de fatura do cartão',donation:'Doação / oferta (conta como despesa)',investment:'Aplicação / resgate de investimento'};
const catName=t=>t.categories?.name||((t.movement_kind||'normal')==='donation'?'Doações e ofertas':'Sem categoria');
// Entram em receitas, despesas, orçamento e vilões: movimentos normais e doações. Transferências entre contas da família e pagamentos de fatura ficam à parte.
function monthTx(){return transactions.filter(t=>String(t.occurred_on).slice(0,7)===month()&&['normal','donation'].includes(t.movement_kind||'normal'))}
function renderDashboard(){const ts=monthTx(),income=ts.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0),expense=ts.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0),variable=ts.filter(t=>t.type==='expense'&&t.cost_behavior!=='fixed').reduce((s,t)=>s+Number(t.amount),0);const other=transactions.filter(t=>String(t.occurred_on).slice(0,7)===month()&&['transfer','card_bill','investment'].includes(t.movement_kind)),sumK=(k,ty)=>other.filter(t=>t.movement_kind===k&&(!ty||t.type===ty)).reduce((s,t)=>s+Number(t.amount),0),parts=[];if(other.some(t=>t.movement_kind==='transfer'))parts.push(`Transferências entre contas da família: saíram ${money(sumK('transfer','expense'))} e entraram ${money(sumK('transfer','income'))}`);if(sumK('card_bill'))parts.push(`Faturas de cartão pagas: ${money(sumK('card_bill'))}`);if(other.some(t=>t.movement_kind==='investment'))parts.push(`Investimentos: aplicados ${money(sumK('investment','expense'))} e resgatados ${money(sumK('investment','income'))}`);{const tgt=income*.2,gap=tgt-(income-expense),el=$('goalGap');if(el)el.innerHTML=!income?'Sem receitas no mês':gap>0?`Reduza <b>${money(gap)}</b> para bater a meta`:`Meta batida: sobram <b>${money(-gap)}</b> acima dos 20%`;const cardIds=new Set(accounts.filter(x=>x.account_type==='credit_card').map(x=>x.id)),mk=month(),cm=history.filter(t=>cardIds.has(t.account_id)&&t.type==='expense'&&['normal','donation'].includes(t.movement_kind||'normal')&&String(t.occurred_on).slice(0,7)===mk),cmv=cm.reduce((s,t)=>s+Number(t.amount),0),cp=reviews.filter(r=>cardIds.has(r.account_id)&&r.suggested_type!=='income'&&r.suggested_movement!=='card_bill'&&autoKind(r)!=='card_bill'&&String(r.transaction_date).slice(0,7)===mk),cpv=cp.reduce((s,r)=>s+Number(r.amount),0),cmEl=$('cardMonth');if(cmEl)cmEl.innerHTML=cardIds.size?`<b>Cartão de crédito no mês:</b> ${money(cmv)} já classificados (${cm.length})${cp.length?` · <b>${money(cpv)}</b> aguardando sua classificação em ${cp.length} compra(s) — vá em Contas e cartões para aprovar`:''}`:'';ld=history.filter(t=>cardIds.has(t.account_id)).map(t=>String(t.occurred_on)).sort().pop(),cn=$('cardNote');if(cn)cn.textContent=cardIds.size&&ld&&(Date.now()-new Date(ld+'T12:00:00'))/864e5>5?`Atenção: o banco ainda não enviou compras do cartão de crédito depois de ${formatDate(ld)}. As despesas do mês podem estar incompletas; lance manualmente as compras que faltam.`:''}
 if($('otherMovements'))$('otherMovements').textContent=parts.length?'Fora de receitas e despesas: '+parts.join(' · '):'';
$('incomeTotal').textContent=money(income);$('expenseTotal').textContent=money(expense);$('balanceTotal').textContent=money(income-expense);$('balanceTotal').className=income-expense>=0?'positive':'negative';$('variableTotal').textContent=money(variable);
 const groups={};ts.filter(t=>t.type==='expense').forEach(t=>{let n=catName(t);groups[n]=(groups[n]||0)+Number(t.amount)});const sorted=Object.entries(groups).sort((a,b)=>b[1]-a[1]);$('categoryBreakdown').innerHTML=sorted.length?sorted.slice(0,7).map(([n,v])=>`<div class="bar-row"><span>${esc(n)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,v/Math.max(...sorted.map(x=>x[1]))*100)}%"></div></div><strong>${money(v)}</strong></div>`).join(''):'Ainda não há lançamentos neste mês.';
 const recent=ts.slice(0,6);$('recentList').innerHTML=recent.length?recent.map(txRow).join(''):'Nenhum lançamento registrado.';const target=variable*.2;$('assistantSummary').textContent=variable?`Até agora, as despesas variáveis somam ${money(variable)}. A referência de economia de 20% representa ${money(target)}. Continue registrando as compras para identificar oportunidades reais.`:'Assim que houver movimentações, mostraremos os principais gastos, variações e oportunidades de economia.'}
function txRow(t){return `<div class="tx-row"><div><strong>${esc(t.description)}</strong><small>${esc(t.categories?.name||'Sem categoria')} · ${esc(memberName(t.member_user_id))} · ${formatDate(t.occurred_on)}</small></div><strong class="${t.type==='income'?'positive':'negative'}">${t.type==='income'?'+':'−'} ${money(t.amount)}</strong></div>`}
function fillCategoryFilter(){const el=$('categoryFilter');if(!el)return;const cur=el.value||'all',opt=c=>`<option value="${c.id}">${esc(c.name)}</option>`;el.innerHTML='<option value="all">Todas as categorias</option><optgroup label="Despesas">'+categories.filter(c=>c.kind==='expense').map(opt).join('')+'</optgroup><optgroup label="Receitas">'+categories.filter(c=>c.kind==='income').map(opt).join('')+'</optgroup>';if([...el.options].some(o=>o.value===cur))el.value=cur}
let recatMode=false;function renderTransactions(){fillCategoryFilter();renderRecatBar();const q=($('searchTransactions')?.value||'').toLowerCase(),f=$('typeFilter')?.value||'all';const cf=$('categoryFilter')?$('categoryFilter').value:'all';const isKind=['transfer','card_bill','donation','investment'].includes(f);const list=transactions.filter(t=>(f==='all'||(isKind?t.movement_kind===f:(t.type===f&&['normal','donation'].includes(t.movement_kind||'normal'))))&&(cf==='all'||t.category_id===cf)&&(`${t.description} ${t.categories?.name||''}`).toLowerCase().includes(q));$('transactionsList').innerHTML=list.length?`<table class="data-table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Responsável</th><th>Pagamento</th><th>Valor</th></tr></thead><tbody>${list.map(t=>`<tr><td>${formatDate(t.occurred_on)}</td><td>${esc(t.description)}${(t.movement_kind||'normal')!=='normal'?`<br><small class="muted">${esc(KIND[t.movement_kind])}</small>`:''}</td><td>${recatMode&&['normal','donation'].includes(t.movement_kind||'normal')?`<select class="rc-cat" data-tx="${t.id}" data-type="${t.type}"><option value="">— sem categoria —</option>${catOptions(t.type,t.category_id)}</select>`:esc(t.categories?.name||'—')}</td><td>${esc(t.family_members?.display_name||'—')}</td><td>${esc(t.payment_method?PM[t.payment_method]||t.payment_method:'—')}<br><small class="muted">${esc(t.financial_accounts?.name||'')}</small></td><td class="${t.type==='income'?'positive':'negative'}">${money(t.amount)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">Nenhum lançamento encontrado.</div>'}
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
$('searchTransactions').oninput=renderTransactions;$('typeFilter').onchange=renderTransactions;$('categoryFilter').onchange=renderTransactions;
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
// Reconhecimento pelo texto da descrição (vale também para itens que já estavam na fila e têm prioridade sobre o histórico).
function autoKind(r){const n=String(r.description||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/(pagamento|pgto|pag)\s*(de\s*)?fatura|fatura\s*(do\s*)?cart|pagamento recebido|pagamento efetuado/.test(n))return 'card_bill';
  if(/rend\w*[\s.]*facil|aplicacao\s*automatica|resgate\s*automatico|aplic\w*\s*(em\s*|de\s*)?(auto|invest|cdb|fundo|poupanca)|resg\w*\s*(em\s*|de\s*)?(auto|invest|cdb|fundo|poupanca)|\b(apl|resg)\.?\s*aut/.test(n))return 'investment';
  if(/(resgate|aplicacao)\s*(rdb|cdb|lci|lca|poupanca|fundo)|rdb/.test(n))return 'investment';
  if(/gastos\s*cartao\s*de\s*credito|pagto\.?\s*por\s*deb|pgto\s*cartao/.test(n))return 'card_bill';
  if(/doacao|dizimo|oferta/.test(n))return 'donation';
  return null}
function dupOf(r){const t=r.suggested_type||'expense';return history.find(h=>h.source!=='bank_import'&&h.type===t&&Number(h.amount)===Number(r.amount)&&Math.abs(new Date(h.occurred_on)-new Date(r.transaction_date))<=2*864e5)}
function renderBank(){
  const list=$('connectionsList');if(!list)return;
  list.innerHTML=connections.length?connections.map(c=>`<div class="tx-row"><div><strong>${esc(c.institution||'Banco conectado')}</strong><small>${c.last_synced_at?'Última sincronização: '+esc(new Date(c.last_synced_at).toLocaleString('pt-BR')):'Ainda não sincronizado'}</small></div></div>`).join(''):'<p class="muted">Nenhum banco conectado ainda.</p>';
  $('syncBank').disabled=!connections.length;
  const rf=$('reviewFilter')?$('reviewFilter').value:'all';
  const info=r=>{const type=r.suggested_type||'expense',sug=suggestFor(r),dup=dupOf(r);const ak=r.suggested_movement?null:autoKind(r);const kind=r.suggested_movement||ak||(sug&&sug.kind)||'normal';const catOk=sug&&sug.cat&&categories.some(c=>c.id===sug.cat&&c.kind===(type==='income'?'income':'expense'))?sug.cat:null;return {type,sug,dup,kind,catOk,ak,has:!!(catOk||kind!=='normal')}};
  const shown=reviews.map(r=>({r,i:info(r)})).filter(({i})=>rf==='all'||((rf==='expense'||rf==='income')?i.type===rf:rf==='suggested'?i.has:rf==='nosuggest'?!i.has:rf==='dup'?!!i.dup:i.kind===rf));
  $('reviewList').innerHTML=shown.length?shown.map(({r,i})=>{const {type,sug,dup,kind,catOk,ak}=i;
    return `<div class="tx-row" data-review="${r.id}" style="flex-wrap:wrap;gap:8px${dup?';border-left:3px solid #c5a45b;padding-left:8px':''}"><div><strong>${esc(r.description)}</strong><small>${formatDate(r.transaction_date)} · ${esc(accountName(r.account_id))}${r.payment_method?' · '+esc(PM[r.payment_method]||r.payment_method):''}${r.counterparty?' · '+esc(r.counterparty):''}</small></div><strong class="${type==='income'?'positive':'negative'}">${money(r.amount)}</strong>
      ${dup?`<div class="notice" style="width:100%;margin:0">⚠ Possível duplicado: já existe “${esc(dup.description)}” de ${money(dup.amount)} em ${formatDate(dup.occurred_on)}, lançado por você. Se for a mesma despesa, toque em <strong>Ignorar</strong>.</div>`:''}
      ${r.bank_status==='pending'?`<small class="muted" style="width:100%">Compra no cartão ainda não confirmada pelo banco (fatura aberta). Quando o banco confirmar, ela é atualizada sem duplicar.</small>`:''}
      ${ak?`<small class="muted" style="width:100%">Reconhecido pelo texto da descrição: ${esc(KIND[ak])}.</small>`:''}${sug&&!ak&&(catOk||kind!=='normal')&&!r.suggested_movement?`<small class="muted" style="width:100%">Sugerido pelo histórico (${sug.count} lançamento${sug.count>1?'s':''} parecido${sug.count>1?'s':''}).</small>`:''}
      <div class="button-row" style="width:100%"><select class="rv-type"><option value="expense"${type==='expense'?' selected':''}>Despesa</option><option value="income"${type==='income'?' selected':''}>Receita</option></select><select class="rv-kind">${Object.entries(KIND).map(([k,v])=>`<option value="${k}"${kind===k?' selected':''}>${v}</option>`).join('')}</select><select class="rv-cat"${kind!=='normal'?' style="display:none"':''}>${catOptions(type,catOk)}</select><button class="primary compact" type="button" data-act="approve">Aprovar</button><button class="secondary compact" type="button" data-act="reject">Ignorar</button></div></div>`}).join(''):`<div class="empty-state">${reviews.length?'Nenhum lançamento neste filtro.':'Nenhum lançamento aguardando revisão.'}</div>`;
  const inv=reviews.filter(r=>(r.suggested_movement||autoKind(r))==='investment');const bb=$('approveInvest');
  if(bb){bb.classList.toggle('hidden',!inv.length);bb.textContent=`Aprovar aplicações e resgates (${inv.length})`}
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
const APP_VERSION='23';
if('serviceWorker'in navigator){const hadController=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloaded){reloaded=true;location.reload()}});
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}))}
async function hardRefresh(){try{const rs=await navigator.serviceWorker?.getRegistrations?.();for(const r of rs||[])await r.unregister()}catch(e){}try{for(const k of await caches.keys())await caches.delete(k)}catch(e){}const u=new URL(location.href);u.searchParams.set('v',Date.now());location.replace(u.toString())}
// Ao abrir (Chrome ou app), compara a versão carregada com a publicada; se diferir, limpa o cache e recarrega sozinho (uma vez).
(async()=>{try{const t=await (await fetch('sw.js?c='+Date.now(),{cache:'no-store'})).text(),m=t.match(/familia-equilibrio-v(\d+)/);
  if(m&&m[1]!==APP_VERSION&&!sessionStorage.getItem('hr'+m[1])){sessionStorage.setItem('hr'+m[1],'1');hardRefresh()}}catch(e){}})();
window.addEventListener('DOMContentLoaded',()=>{const b=document.getElementById('clearCache');if(b)b.onclick=hardRefresh;const v=document.getElementById('appVersion');if(v)v.textContent='Versão do app: '+APP_VERSION});

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
document.addEventListener('change',e=>{const s=e.target;if(!s.matches||!s.matches('.rv-cat,#txCategory,.rc-cat,#bulkRecat')||s.value!=='__new__')return;
  catTarget=s;catSaved=false;const type=s.id==='txCategory'?$('txType').value:s.dataset.type||(s.id==='bulkRecat'?'expense':s.closest('[data-review]').querySelector('.rv-type').value);
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
  if(catTarget&&catTarget.classList.contains('rc-cat')){catTarget.innerHTML='<option value="">— sem categoria —</option>'+catOptions(catTarget.dataset.type,data.id);catTarget.value=data.id;saveRecat(catTarget)}
  if(catTarget&&catTarget.id==='bulkRecat'){renderRecatBar();$('bulkRecat').value=data.id}
  closeDialog('catDialog');toast('Categoria criada: '+name)}catch(err){message('catMessage',err.message)}};

// Varredura: reaplica o aprendizado do histórico em todos os itens pendentes e resume o resultado.
$('reviewFilter').onchange=renderBank;
$('scanReview').onclick=()=>{learnMap=null;renderBank();
  let has=0,dups=0;for(const r of reviews){const type=r.suggested_type||'expense',sug=suggestFor(r);const ok=r.suggested_movement||autoKind(r)||(sug&&((sug.cat&&categories.some(c=>c.id===sug.cat&&c.kind===(type==='income'?'income':'expense')))||sug.kind!=='normal'));if(ok)has++;if(dupOf(r))dups++}
  $('scanResult').textContent=reviews.length?`Varredura concluída: ${has} de ${reviews.length} itens já vieram classificados pelo histórico (${reviews.length-has} precisam da sua classificação) e ${dups} possível(is) duplicado(s). Revise e toque em Aprovar.`:'Nenhum item aguardando revisão.';}

// Aba Investimentos: carteira importada das contas conectadas + visão de contas e cartões.
const INV_TYPE={FIXED_INCOME:'Renda fixa',MUTUAL_FUND:'Fundos de investimento',EQUITY:'Ações',ETF:'ETFs',SECURITY:'Previdência e outros títulos',CO:'COE',COE:'COE',OTHER:'Outros'};
function renderInvestments(){const box=$('investmentsContent');if(!box)return;
  const sum=(arr,f)=>arr.reduce((s,x)=>s+(Number(f(x))||0),0);
  const total=sum(investments,i=>i.balance),invested=sum(investments.filter(i=>i.amount_invested!=null),i=>i.amount_invested),profit=sum(investments.filter(i=>i.profit!=null),i=>i.profit);
  const bank=sum(accounts.filter(a=>a.account_type==='bank_account'&&a.balance!=null),a=>a.balance),cards=cardOpen().total;
  const last=investments.map(i=>i.updated_at).sort().pop();
  const metric=(t,v,s)=>`<article class="metric"><span>${t}</span><strong>${v}</strong><small>${s}</small></article>`;
  let html=`<div class="metric-grid">${metric('Investimentos',money(total),investments.length+' aplicações')}${metric('Saldo em contas',money(bank),'Contas bancárias conectadas')}${metric('Cartões em aberto',money(cards),'Valor usado nos cartões')}${metric('Rentabilidade',investments.some(i=>i.profit!=null)?money(profit):'—',invested?`sobre ${money(invested)} aplicados`:'Quando o banco informar')}</div>`;
  if(!investments.length){html+='<div class="panel empty-state">Nenhum investimento encontrado. Toque em <strong>Sincronizar agora</strong> em Contas e cartões. Se continuar vazio, o banco pode não estar compartilhando investimentos no Open Finance: confira as permissões da conexão no MeuPluggy.</div>';box.innerHTML=html;return}
  const groups={};investments.forEach(i=>{const k=i.type||'OTHER';(groups[k]=groups[k]||[]).push(i)});
  html+=Object.entries(groups).sort((x,y)=>sum(y[1],i=>i.balance)-sum(x[1],i=>i.balance)).map(([k,list])=>{const sub=sum(list,i=>i.balance);
    return `<article class="panel"><div class="panel-heading"><div><h3>${esc(INV_TYPE[k]||k)}</h3><p class="muted">${money(sub)}${total?` · ${Math.round(sub/total*100)}% da carteira`:''}</p></div></div>${list.map(i=>`<div class="tx-row"><div><strong>${esc(i.name)}</strong><small>${esc([i.institution,i.issuer&&i.issuer!==i.institution?i.issuer:null,i.annual_rate!=null?Number(i.annual_rate).toLocaleString('pt-BR',{maximumFractionDigits:2})+'% a.a.':null,i.due_date?'vence '+formatDate(i.due_date):null].filter(Boolean).join(' · '))}</small></div><strong>${money(i.balance)}</strong></div>`).join('')}</article>`}).join('');
  html+=yieldHtml();
  html+=`<p class="tiny muted">Atualizado em ${last?new Date(last).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}. Os valores vêm do banco via Open Finance; não entram nas receitas e despesas.</p>`;
  box.innerHTML=html}

// Aprova de uma vez as aplicações/resgates de investimento (ex.: Rende Fácil), sem contar como receita ou despesa.
$('approveInvest').onclick=async()=>{const inv=reviews.filter(r=>(r.suggested_movement||autoKind(r))==='investment');if(!inv.length)return;
  const total=inv.reduce((s,r)=>s+Number(r.amount),0);
  if(!confirm(`Aprovar ${inv.length} lançamento(s) (soma de ${money(total)}) como aplicação/resgate de investimento? Eles não contam como receita nem despesa.`))return;
  const b=$('approveInvest');b.disabled=true;try{
    const rows=inv.map(r=>({family_id:family,type:r.suggested_type||'expense',amount:Number(r.amount),description:r.description,category_id:null,occurred_on:r.transaction_date,member_user_id:session.user.id,account_id:r.account_id,cost_behavior:(r.suggested_type==='income')?'income':'variable',source:'bank_import',movement_kind:'investment',payment_method:r.payment_method||null,counterparty:r.counterparty||null,external_transaction_id:r.external_transaction_id,created_by:session.user.id}));
    const {error}=await client.from('transactions').insert(rows);if(error)throw error;
    const {error:e2}=await client.from('bank_import_review').update({review_status:'approved',final_movement:'investment',reviewed_by:session.user.id,reviewed_at:new Date().toISOString()}).in('id',inv.map(r=>r.id));if(e2)throw e2;
    await loadAll();toast(`${inv.length} lançamento(s) aprovados como investimento.`)}catch(err){toast(err.message)}finally{b.disabled=false}};

// Resumo patrimonial da tela inicial: contas, investimentos e cartões.
// Cartões com o mesmo limite e o mesmo valor em aberto (limite compartilhado) entram uma única vez na soma.
function cardOpen(){const seen=new Set(),list=[];let total=0;
  for(const a of accounts.filter(x=>x.account_type==='credit_card'&&x.balance!=null)){const key=a.credit_limit&&Number(a.balance)>0?a.credit_limit+'|'+a.balance:a.id;const shared=seen.has(key);seen.add(key);list.push({a,shared});if(!shared)total+=Number(a.balance)}
  return {total,list}}
function renderWealth(){const el=$('wealthPanel');if(!el)return;
  const bankList=accounts.filter(a=>a.account_type==='bank_account'&&a.balance!=null),bank=bankList.reduce((s,a)=>s+Number(a.balance),0);
  const inv=investments.reduce((s,i)=>s+(Number(i.balance)||0),0),cards=cardOpen(),net=bank+inv-cards.total;
  if(!bankList.length&&!investments.length&&!cards.list.length){el.innerHTML='';return}
  const card=(t,v,s,cls='')=>`<article class="metric ${cls}"><span>${t}</span><strong>${money(v)}</strong><small>${s}</small></article>`;
  const invByType={};investments.forEach(i=>{const k=INV_TYPE[i.type||'OTHER']||i.type||'Outros';invByType[k]=(invByType[k]||0)+(Number(i.balance)||0)});
  const row=(n,v,x='')=>`<div class="tx-row"><div><strong>${esc(n)}</strong>${x?`<small>${esc(x)}</small>`:''}</div><strong>${money(v)}</strong></div>`;
  el.innerHTML=`<div class="metric-grid">${card('Saldo em contas',bank,bankList.length+' conta(s) bancária(s)')}${card('Investimentos',inv,investments.length+' aplicação(ões)')}${card('Cartões em aberto',cards.total,cards.list.length+' cartão(ões)')}${card('Total (contas + investimentos − cartões)',net,'Posição atual',net>=0?'highlight':'')}</div>
  <details class="panel" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:600">Ver detalhes dos saldos</summary>
   <h4>Contas</h4>${bankList.map(a=>row(a.name,a.balance,a.owner_name||'')).join('')||'<p class="muted tiny">Sem contas com saldo.</p>'}
   <h4>Investimentos</h4>${Object.entries(invByType).sort((x,y)=>y[1]-x[1]).map(([n,v])=>row(n,v)).join('')||'<p class="muted tiny">Nenhum investimento importado.</p>'}
   <h4>Cartões em aberto</h4>${cards.list.map(({a,shared})=>row(a.name,a.balance,shared?'mesmo limite e valor de outro cartão: contado uma vez':(a.credit_limit?'limite '+money(a.credit_limit):''))).join('')||'<p class="muted tiny">Sem cartões com saldo.</p>'}
   <p class="tiny muted">Valores informados pelos bancos${(()=>{const d=[...accounts.map(a=>a.balance_updated_at),...investments.map(i=>i.updated_at)].filter(Boolean).sort().pop();return d?' em '+new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''})()}. Se um investimento (como o Rende Fácil) já estiver somado no saldo da conta, o total pode ficar maior que o real.</p></details>`}

// Aba Meses: histórico de qualquer mês e comparativo mês a mês (receitas, despesas e economia).
// Conta como receita/despesa o mesmo que o painel: movimentos normais e doações (transferências, faturas e aplicações ficam de fora).
let monthsSel=null;
const MONTH_FULL=k=>new Date(k+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const MONTH_SHORT=k=>new Date(k+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}).replace('.','');
const shiftMonth=(k,n)=>{const d=new Date(k+'-15T12:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
function catLabel(t){return t.category_id?(categories.find(c=>c.id===t.category_id)?.name||'Sem categoria'):(t.movement_kind==='donation'?'Doações e ofertas':'Sem categoria')}
function monthAgg(dayLimit){const m={};for(const t of history){if(!['normal','donation'].includes(t.movement_kind||'normal'))continue;if(dayLimit&&Number(String(t.occurred_on).slice(8,10))>dayLimit)continue;const k=String(t.occurred_on).slice(0,7),o=m[k]||(m[k]={income:0,expense:0,cats:{},list:[]}),v=Number(t.amount)||0;
    if(t.type==='income')o.income+=v;else{o.expense+=v;const c=catLabel(t);o.cats[c]=(o.cats[c]||0)+v;o.list.push(t)}}
  return m}
function renderMonths(){const box=$('monthsContent');if(!box)return;
  const cur=month();if(!monthsSel)monthsSel=cur;const agg=monthAgg(),sel=monthsSel,prev=shiftMonth(sel,-1),part=sel===cur,aggP=part?monthAgg(Number(today().slice(8,10))):agg,sameTxt=part?' (até dia '+Number(today().slice(8,10))+')':'';
  const g=k=>agg[k]||{income:0,expense:0,cats:{},list:[]},S=g(sel),P=aggP[prev]||{income:0,expense:0,cats:{},list:[]};
  const save=S.income-S.expense,rate=S.income>0?save/S.income*100:null,pctTxt=v=>v==null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:0})+'%';
  const diff=(now,before)=>{const d=now-before;if(!before&&!now)return '—';const p=before?` (${d>=0?'+':''}${(d/before*100).toLocaleString('pt-BR',{maximumFractionDigits:0})}%)`:'';return `${d>=0?'+':'−'} ${money(Math.abs(d))}${p}`};
  const metric=(t,v,s,cls)=>`<article class="metric ${cls||''}"><span>${t}</span><strong>${v}</strong><small>${s}</small></article>`;
  // últimos 12 meses terminando no mês escolhido
  const seq=[];for(let i=11;i>=0;i--)seq.push(shiftMonth(sel,-i));
  const maxV=Math.max(1,...seq.map(k=>Math.max(g(k).income,g(k).expense)));
  const rows=seq.slice().reverse().map(k=>{const x=g(k),sv=x.income-x.expense,r=x.income>0?sv/x.income*100:null,has=x.income||x.expense;
    return `<tr data-m="${k}" style="cursor:pointer${k===sel?';background:#1d5a4315':''}"><td>${esc(MONTH_SHORT(k))}</td><td>${has?money(x.income):'—'}</td><td>${has?money(x.expense):'—'}</td><td class="${sv>=0?'positive':'negative'}">${has?money(sv):'—'}</td><td>${has?pctTxt(r):'—'}</td></tr>`}).join('');
  const bars=seq.map(k=>{const x=g(k);return `<div style="flex:1;min-width:0;text-align:center" data-m="${k}"><div style="height:90px;display:flex;align-items:flex-end;justify-content:center;gap:2px"><div title="Receitas" style="width:40%;background:#1d5a43;height:${Math.max(x.income?3:0,x.income/maxV*100)}%"></div><div title="Despesas" style="width:40%;background:#b64d43;height:${Math.max(x.expense?3:0,x.expense/maxV*100)}%"></div></div><small style="font-size:9px;${k===sel?'font-weight:700':''}">${esc(MONTH_SHORT(k).split(' ')[0])}</small></div>`}).join('');
  const cats=[...new Set([...Object.keys(S.cats),...Object.keys(P.cats)])].sort((x,y)=>(S.cats[y]||0)-(S.cats[x]||0));
  const catRows=cats.map(c=>{const n=S.cats[c]||0,p=P.cats[c]||0,d=n-p;return `<tr><td>${esc(c)}</td><td>${n?money(n):'—'}</td><td>${p?money(p):'—'}</td><td class="${d>0?'negative':d<0?'positive':''}">${d?(d>0?'+ ':'− ')+money(Math.abs(d)):'—'}</td></tr>`}).join('');
  const top=S.list.slice().sort((x,y)=>Number(y.amount)-Number(x.amount)).slice(0,15).map(t=>`<div class="tx-row"><div><strong>${esc(t.description)}</strong><small>${esc(catLabel(t))} · ${formatDate(t.occurred_on)}</small></div><strong class="negative">− ${money(t.amount)}</strong></div>`).join('');
  box.innerHTML=`<div class="button-row" style="margin-bottom:12px;align-items:center"><button class="secondary compact" type="button" data-m="${prev}">◀</button><input type="month" id="monthsPick" value="${sel}" max="${cur}" style="flex:1;min-width:0"><button class="secondary compact" type="button" data-m="${shiftMonth(sel,1)}"${sel>=cur?' disabled':''}>▶</button></div>
  <h3 style="text-transform:capitalize;margin:4px 0 12px">${esc(MONTH_FULL(sel))}</h3>
  <div class="metric-grid">${metric('Receitas',money(S.income),'Comparado a '+MONTH_SHORT(prev)+sameTxt+': '+diff(S.income,P.income))}${metric('Despesas',money(S.expense),'Comparado a '+MONTH_SHORT(prev)+sameTxt+': '+diff(S.expense,P.expense))}${metric('Economia do mês',money(save),'Receitas menos despesas',save>=0?'highlight':'')}${metric('Taxa de economia',pctTxt(rate),'Meta: 20%'+(rate==null?'':rate>=20?' · meta atingida':' · abaixo da meta'))}</div>
  <article class="panel"><div class="panel-heading"><div><h3>Mês a mês</h3><p class="muted">Receitas (verde) e despesas (vermelho) dos últimos 12 meses. Toque num mês para abrir.</p></div></div><div style="display:flex;gap:2px;align-items:flex-end;margin-bottom:12px">${bars}</div>
   <div class="table-wrap"><table class="data-table"><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Economia</th><th>Taxa</th></tr></thead><tbody>${rows}</tbody></table></div></article>
  <article class="panel"><div class="panel-heading"><div><h3>Categorias: ${esc(MONTH_SHORT(sel))} × ${esc(MONTH_SHORT(prev))}${sameTxt}</h3><p class="muted">Vermelho: gastou mais que no mês anterior. Verde: gastou menos.</p></div></div>${cats.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Categoria</th><th>${esc(MONTH_SHORT(sel))}</th><th>${esc(MONTH_SHORT(prev))}</th><th>Diferença</th></tr></thead><tbody>${catRows}</tbody></table></div>`:'<div class="empty-state">Sem despesas nesses meses.</div>'}</article>
  ${matrixHtml(agg,aggP,sel,prev,part)}
  <article class="panel"><div class="panel-heading"><div><h3>Maiores despesas do mês</h3></div></div>${top||'<div class="empty-state">Nenhuma despesa neste mês.</div>'}</article>
  <p class="tiny muted">Não entram: transferências entre contas da família, pagamentos de fatura e aplicações/resgates. Doações contam como despesa.${history.length>=3000?' O histórico considera os últimos 3.000 lançamentos.':''}</p>`}
$('monthsContent').addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(!b||b.disabled)return;monthsSel=b.dataset.m;renderMonths();window.scrollTo({top:0})});
$('monthsContent').addEventListener('change',e=>{if(e.target.id==='monthsPick'&&e.target.value){monthsSel=e.target.value;renderMonths()}});

// Conciliação: procura lançamentos possivelmente duplicados e movimentações internas contadas como receita/despesa.
const RECON_KEY='recon_dismissed';let reconOpen=false;
const reconDismissed=()=>{try{return new Set(JSON.parse(localStorage.getItem(RECON_KEY)||'[]'))}catch(e){return new Set()}};
const reconDismiss=k=>{try{const s=reconDismissed();s.add(k);localStorage.setItem(RECON_KEY,JSON.stringify([...s]))}catch(e){}};
const dnorm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\d+/g,'').replace(/[^a-z]+/g,' ').trim().slice(0,22);
function reconFind(){const out=[],dis=reconDismissed(),days=(x,y)=>Math.abs((new Date(x)-new Date(y))/864e5);
  const counted=history.filter(t=>['normal','donation'].includes(t.movement_kind||'normal'));
  for(const t of history){if((t.movement_kind||'normal')!=='normal')continue;const k=autoKind(t);if(k&&!dis.has('k'+t.id))out.push({key:'k'+t.id,kind:'fix',t,to:k})}
  const seen=new Set();
  for(let i=0;i<counted.length;i++)for(let j=i+1;j<counted.length;j++){const x=counted[i],y=counted[j];
    if(x.type!==y.type||Number(x.amount)!==Number(y.amount)||x.account_id!==y.account_id||days(x.occurred_on,y.occurred_on)>1)continue;
    if(dnorm(x.description)!==dnorm(y.description))continue;
    const key='d'+[x.id,y.id].sort().join('-');if(dis.has(key)||seen.has(key))continue;seen.add(key);out.push({key,kind:'dup',a:x,b:y})}
  const bills=history.filter(t=>t.movement_kind==='card_bill'&&t.type==='expense');
  for(const t of counted){if(t.type!=='expense'||Number(t.amount)<30)continue;const b=bills.find(x=>Number(x.amount)===Number(t.amount)&&days(x.occurred_on,t.occurred_on)<=3&&x.id!==t.id);
    const key='b'+t.id;if(b&&!dis.has(key))out.push({key,kind:'bill',t,b})}
  return out}
function renderRecon(){const box=$('reconBox');if(!box)return;if(!reconOpen){box.innerHTML='';return}
  const items=reconFind(),line=t=>`<strong>${esc(t.description)}</strong> · ${formatDate(t.occurred_on)} · ${t.type==='income'?'+':'−'} ${money(t.amount)}`;
  const card=(it)=>{const dis=`<button class="secondary compact" data-rd="${it.key}">Não é problema</button>`;
    if(it.kind==='fix')return `<div class="tx-row"><div>${line(it.t)}<small>Parece ${esc(KIND[it.to]||it.to)}, mas está contando como receita/despesa.</small></div><div class="button-row"><button class="primary compact" data-rf="${it.t.id}" data-to="${it.to}">Corrigir</button>${dis}</div></div>`;
    if(it.kind==='dup')return `<div class="tx-row"><div>${line(it.a)}<small>Parecida com: ${line(it.b)}<br>Pode ser repetida ou ser dois pagamentos reais (ex.: pedágio).</small></div><div class="button-row"><button class="secondary compact" data-rx="${it.b.id}">Excluir a segunda</button>${dis}</div></div>`;
    return `<div class="tx-row"><div>${line(it.t)}<small>Mesmo valor de uma fatura paga em ${formatDate(it.b.occurred_on)} (${esc(it.b.description)}). Pode estar contada duas vezes.</small></div><div class="button-row">${dis}</div></div>`};
  box.innerHTML=`<article class="panel"><div class="panel-heading"><div><h3>Conciliação</h3><p class="muted">${items.length?items.length+' ponto(s) para conferir.':'Nenhuma duplicidade encontrada.'} Analisa os últimos ${history.length} lançamentos.</p></div></div>${items.map(card).join('')}</article>`}
document.addEventListener('click',async e=>{const b=e.target.closest('#reconBtn,[data-rd],[data-rf],[data-rx]');if(!b)return;
  if(b.id==='reconBtn'){reconOpen=!reconOpen;renderRecon();return}
  if(b.dataset.rd){reconDismiss(b.dataset.rd);renderRecon();return}
  if(b.dataset.rf){const{error}=await client.from('transactions').update({movement_kind:b.dataset.to}).eq('id',b.dataset.rf);if(error)return toast('Não foi possível corrigir: '+error.message);toast('Corrigido.');await loadAll();renderRecon();return}
  if(b.dataset.rx){if(!confirm('Excluir este lançamento? Isso não pode ser desfeito.'))return;const{error}=await client.from('transactions').delete().eq('id',b.dataset.rx);if(error)return toast('Não foi possível excluir: '+error.message);toast('Excluído.');await loadAll();renderRecon()}});

// Reclassificação: edita a categoria de lançamentos já aprovados, um a um ou em lote (pelo filtro/busca atual).
function listedTx(){const q=($('searchTransactions')?.value||'').toLowerCase(),f=$('typeFilter')?.value||'all',cf=$('categoryFilter')?$('categoryFilter').value:'all';
  const isKind=['transfer','card_bill','donation','investment'].includes(f);
  return transactions.filter(t=>(f==='all'||(isKind?t.movement_kind===f:(t.type===f&&['normal','donation'].includes(t.movement_kind||'normal'))))&&(cf==='all'||t.category_id===cf)&&(`${t.description} ${t.categories?.name||''}`).toLowerCase().includes(q))}
function renderRecatBar(){const box=$('recatBar');if(!box)return;const btn=$('recatToggle');if(btn)btn.textContent=recatMode?'Concluir reclassificação':'Reclassificar despesas';
  if(!recatMode){box.innerHTML='';return}
  const keep=$('bulkRecat')?.value,n=listedTx().filter(t=>t.type==='expense'&&['normal','donation'].includes(t.movement_kind||'normal')).length;
  box.innerHTML=`<article class="panel"><p class="muted">Troque a categoria de cada lançamento na lista abaixo. Para mudar vários de uma vez, busque pelo nome (ex.: <b>vercel</b>, <b>posto</b>), escolha a categoria e aplique. Use <b>＋ Nova categoria…</b> para criar uma nova.</p><div class="button-row"><select id="bulkRecat" data-type="expense" style="flex:1;min-width:0"><option value="">Escolha a categoria para aplicar…</option>${catOptions('expense')}</select><button class="primary" type="button" id="bulkRecatBtn">Aplicar a ${n} despesa(s) listada(s)</button></div></article>`;
  if(keep&&[...$('bulkRecat').options].some(o=>o.value===keep))$('bulkRecat').value=keep}
async function saveRecat(sel){const{error}=await client.from('transactions').update({category_id:sel.value||null}).eq('id',sel.dataset.tx);if(error)return toast('Não foi possível salvar: '+error.message);
  const t=transactions.find(x=>x.id===sel.dataset.tx);if(t){t.category_id=sel.value||null;t.categories=sel.value?{name:categories.find(c=>c.id===sel.value)?.name,kind:t.type}:null}
  const h=history.find(x=>x.id===sel.dataset.tx);if(h)h.category_id=sel.value||null;toast('Categoria atualizada.')}
document.addEventListener('change',e=>{const s=e.target;if(s.matches?.('.rc-cat')&&s.value!=='__new__')saveRecat(s)});
document.addEventListener('click',async e=>{const b=e.target.closest('#recatToggle,#bulkRecatBtn');if(!b)return;
  if(b.id==='recatToggle'){recatMode=!recatMode;renderTransactions();return}
  const cat=$('bulkRecat').value;if(!cat||cat==='__new__')return toast('Escolha a categoria primeiro.');
  const ids=listedTx().filter(t=>t.type==='expense'&&['normal','donation'].includes(t.movement_kind||'normal')).map(t=>t.id);if(!ids.length)return toast('Nenhuma despesa na lista.');
  if(!confirm(`Mudar ${ids.length} despesa(s) para "${categories.find(c=>c.id===cat)?.name}"?`))return;
  const{error}=await client.from('transactions').update({category_id:cat}).in('id',ids);if(error)return toast('Não foi possível salvar: '+error.message);
  toast(ids.length+' despesa(s) reclassificada(s).');await loadAll()});
for(const id of ['searchTransactions','typeFilter','categoryFilter'])document.addEventListener('DOMContentLoaded',()=>{$(id)?.addEventListener('input',renderRecatBar);$(id)?.addEventListener('change',renderRecatBar)});

// Rendimento: usa o histórico de saldo e cotas. Rendimento = cotas × variação do valor da cota, então aportes e resgates não distorcem.
let snaps=[],snapBusy=false,autoSynced=false;
async function snapshotInvestments(){if(snapBusy||!family||!investments.length)return;snapBusy=true;try{
  const rows=investments.filter(i=>Number(i.quantity)>0&&Number(i.balance)>0&&i.reference_date).map(i=>({family_id:family,external_id:i.external_id,name:i.name,ref_date:i.reference_date,balance:i.balance,quantity:i.quantity,created_by:session.user.id}));
  if(rows.length)await client.from('investment_snapshots').upsert(rows,{onConflict:'family_id,external_id,ref_date',ignoreDuplicates:true});
  const{data}=await client.from('investment_snapshots').select('external_id,name,ref_date,balance,quantity').eq('family_id',family).order('ref_date');
  snaps=data||[];renderInvestments()}catch(e){}finally{snapBusy=false}}
// Atualiza os dados do banco sozinho ao abrir o app, se a última sincronização tiver mais de 6 horas.
async function autoSync(){if(autoSynced||!connections.length)return;autoSynced=true;
  const old=connections.some(c=>!c.last_synced_at||Date.now()-new Date(c.last_synced_at)>6*36e5);if(!old)return;
  try{const{error}=await client.functions.invoke('pluggy-sync');if(!error)await loadAll()}catch(e){}}
function yieldCalc(){const by={};for(const s of snaps)(by[s.external_id]=by[s.external_id]||[]).push(s);
  const mk=month(),d30=new Date(Date.now()-30*864e5).toISOString().slice(0,10),res=[];
  for(const [id,list] of Object.entries(by)){const iv=[];for(let i=1;i<list.length;i++){const p=list[i-1],c=list[i],pp=p.balance/p.quantity,cp=c.balance/c.quantity;
      iv.push({to:c.ref_date,from:p.ref_date,base:p.quantity*pp,gain:p.quantity*(cp-pp),days:Math.max(1,Math.round((new Date(c.ref_date)-new Date(p.ref_date))/864e5))})}
    const inv=investments.find(x=>x.external_id===id);if(!inv||!(Number(inv.balance)>0))continue;
    const agg=f=>{const l=iv.filter(f),g=l.reduce((s,x)=>s+x.gain,0),b=l.reduce((s,x)=>s+x.base,0);return l.length?{gain:g,pct:b?g/b*100:0}:null};
    res.push({name:inv.name,balance:Number(inv.balance),n:list.length,last:iv.length?iv[iv.length-1]:null,month:agg(x=>x.to.slice(0,7)===mk),d30:agg(x=>x.to>=d30),all:agg(()=>true),first:list[0]?.ref_date})}
  return res}
function yieldHtml(){const r=yieldCalc(),pc=v=>v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%',cell=x=>x?`<span class="${x.gain>=0?'positive':'negative'}">${x.gain>=0?'+':'−'} ${money(Math.abs(x.gain))}</span><br><small class="muted">${pc(x.pct)}</small>`:'—';
  const have=r.filter(x=>x.last);
  if(!have.length)return `<article class="panel"><div class="panel-heading"><div><h3>Rendimento</h3><p class="muted">Comecei a registrar o histórico dos seus investimentos hoje. Depois da próxima atualização do banco (o app atualiza sozinho ao abrir, ou toque em <strong>Sincronizar agora</strong>), o rendimento diário e mensal aparece aqui.</p></div></div></article>`;
  const tot=k=>{const l=have.map(x=>x[k]).filter(Boolean);if(!l.length)return null;const g=l.reduce((s,x)=>s+x.gain,0),b=l.reduce((s,x)=>s+(x.pct?x.gain/(x.pct/100):0),0);return{gain:g,pct:b?g/b*100:0}};
  const lastT=(()=>{const l=have.map(x=>x.last);const g=l.reduce((s,x)=>s+x.gain,0),b=l.reduce((s,x)=>s+x.base,0);return{gain:g,pct:b?g/b*100:0,to:l.map(x=>x.to).sort().pop(),days:Math.max(...l.map(x=>x.days))}})();
  return `<article class="panel"><div class="panel-heading"><div><h3>Rendimento</h3><p class="muted">Ganho real das aplicações, sem contar o dinheiro que você colocou ou tirou. Registro desde ${formatDate(r.map(x=>x.first).filter(Boolean).sort()[0])}.</p></div></div>
  <div class="metric-grid"><article class="metric"><span>Último período</span><strong class="${lastT.gain>=0?'positive':'negative'}">${lastT.gain>=0?'+':'−'} ${money(Math.abs(lastT.gain))}</strong><small>${pc(lastT.pct)} · até ${formatDate(lastT.to)}${lastT.days>1?' ('+lastT.days+' dias)':''}</small></article>
  <article class="metric"><span>No mês</span><strong>${tot('month')?(tot('month').gain>=0?'+':'−')+' '+money(Math.abs(tot('month').gain)):'—'}</strong><small>${tot('month')?pc(tot('month').pct):'Sem dados no mês'}</small></article>
  <article class="metric"><span>Últimos 30 dias</span><strong>${tot('d30')?(tot('d30').gain>=0?'+':'−')+' '+money(Math.abs(tot('d30').gain)):'—'}</strong><small>${tot('d30')?pc(tot('d30').pct):'—'}</small></article></div>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Aplicação</th><th>Saldo</th><th>Último</th><th>No mês</th></tr></thead><tbody>${have.map(x=>`<tr><td>${esc(x.name.slice(0,48))}</td><td>${money(x.balance)}</td><td>${cell(x.last&&{gain:x.last.gain,pct:x.last.base?x.last.gain/x.last.base*100:0})}</td><td>${cell(x.month)}</td></tr>`).join('')}</tbody></table></div>
  <p class="tiny muted">O banco informa o saldo uma vez por dia, então o rendimento diário vem da diferença entre um dia e o seguinte. Fundos de renda fixa podem variar um pouco de um dia para o outro.</p></article>`}

// Categoria por categoria nos últimos 6 meses: mostra onde a despesa está caindo (verde) ou subindo (vermelho).
function matrixHtml(agg,aggP,sel,prev,part){const ms=[];for(let i=5;i>=0;i--)ms.push(shiftMonth(sel,-i));
  const gc=(k,c)=>(agg[k]?.cats||{})[c]||0,prevC=c=>(aggP[prev]?.cats||{})[c]||0;
  const names=[...new Set(ms.flatMap(k=>Object.keys(agg[k]?.cats||{})))].sort((x,y)=>gc(sel,y)-gc(sel,x)||ms.reduce((s,k)=>s+gc(k,y)-gc(k,x),0));
  if(!names.length)return '';
  let down=0,up=0,saved=0;
  const rows=names.map(c=>{const n=gc(sel,c),p=prevC(c),d=n-p;if(d<-0.005){down++;saved+=-d}else if(d>0.005)up++;
    return `<tr><td>${esc(c)}</td>${ms.map(k=>`<td${k===sel?' style="font-weight:700"':''}>${gc(k,c)?money(gc(k,c)):'—'}</td>`).join('')}<td class="${d<-0.005?'positive':d>0.005?'negative':''}">${d<-0.005?'▼ ':d>0.005?'▲ ':''}${Math.abs(d)>0.005?money(Math.abs(d)):'—'}</td></tr>`}).join('');
  return `<article class="panel"><div class="panel-heading"><div><h3>Categoria por categoria</h3><p class="muted">${down} categoria(s) com gasto menor que no mês anterior${part?' (até o mesmo dia)':''}, ${up} com gasto maior. Redução somada: ${money(saved)}.</p></div></div>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Categoria</th>${ms.map(k=>`<th>${esc(MONTH_SHORT(k))}${k===sel&&part?'*':''}</th>`).join('')}<th>Variação</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="tiny muted">▼ verde = reduziu, ▲ vermelho = aumentou, em relação ao mês anterior${part?'. *Mês em andamento: a variação compara com o mesmo período do mês passado.':'.'}</p></article>`}

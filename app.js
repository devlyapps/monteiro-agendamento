/* ===================== LEMBRETES (Firebase Cloud Messaging) ===================== */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyArsioR3GA87ILUM8AhyNpKwvd40qV1-0U",
  authDomain: "monteiro-barbearia-bc806.firebaseapp.com",
  projectId: "monteiro-barbearia-bc806",
  storageBucket: "monteiro-barbearia-bc806.firebasestorage.app",
  messagingSenderId: "718127553031",
  appId: "1:718127553031:web:4525aaddbbfa16aecce8a2"
};
const FCM_VAPID_KEY = "BHKj99IKtoyQTnporSLjeTNC-PtzeBhoBt7QdFq2Ql2bgwSzwHfbfZ_Yys5hNUp4HrWnRGGIxw45J62qU15Q2ns";
// Identificador fixo do admin na aba PUSH_TOKENS (precisa bater com o mesmo valor no backend).
const ADMIN_PUSH_ID = 'ADMIN_BARBEIRO';
let fcmMessaging = null;

function initFcm(){
  if (!('serviceWorker' in navigator) || typeof firebase === 'undefined') return;
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    fcmMessaging = firebase.messaging();
  } catch(e){ console.warn('Firebase não inicializado:', e); }
}

function updateReminderBanner(){
  const supported = 'Notification' in window && fcmMessaging;
  // Banner na tela inicial — só mostra se ainda não decidiu
  const b1 = document.getElementById('reminderBanner');
  if(b1) b1.style.display = (supported && Notification.permission === 'default') ? 'block' : 'none';
  // Banner na tela Meus Horários — mostra sempre que o token não foi registrado ainda
  const b2 = document.getElementById('reminderApptBanner');
  if(b2) b2.style.display = supported ? 'block' : 'none';
  // Banner no painel admin — só mostra se ainda não decidiu
  const b3 = document.getElementById('adminReminderBanner');
  if(b3) b3.style.display = (supported && Notification.permission === 'default') ? 'block' : 'none';
}

async function enablePushReminders(){
  if(!fcmMessaging){ toast('Lembretes não disponíveis nesse navegador'); return; }
  try{
    // Pede permissão se ainda não foi concedida
    const permission = await Notification.requestPermission();
    if(permission !== 'granted'){ toast('Permissão de notificação não concedida'); return; }
    toast('Registrando...');
    const registration = await navigator.serviceWorker.ready;
    const token = await fcmMessaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if(token && state.userPhone){
      const res = await apiPost('saveFcmToken', { phone: state.userPhone, token });
      if(res.error){ toast('Erro ao salvar: ' + res.error); return; }
      toast('✅ Lembretes ativados! Você receberá avisos antes dos seus horários.');
      // Esconde os dois banners após ativar com sucesso
      const b1 = document.getElementById('reminderBanner');
      const b2 = document.getElementById('reminderApptBanner');
      if(b1) b1.style.display = 'none';
      if(b2) b2.style.display = 'none';
    } else {
      toast('Não foi possível obter o token. Tente pelo Safari com o app instalado.');
    }
  } catch(e){
    console.error(e);
    toast('Erro: ' + e.message);
  }
}

async function enableAdminPushNotifications(){
  if(!fcmMessaging){ toast('Notificações não disponíveis nesse navegador'); return; }
  try{
    const permission = await Notification.requestPermission();
    if(permission !== 'granted'){ toast('Permissão de notificação não concedida'); return; }
    toast('Registrando...');
    const registration = await navigator.serviceWorker.ready;
    const token = await fcmMessaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if(token){
      const res = await apiPost('saveFcmToken', { phone: ADMIN_PUSH_ID, token });
      if(res.error){ toast('Erro ao salvar: ' + res.error); return; }
      toast('✅ Notificações ativadas! Você será avisado a cada novo agendamento de cliente.');
      const b = document.getElementById('adminReminderBanner');
      if(b) b.style.display = 'none';
    } else {
      toast('Não foi possível obter o token. Tente pelo Safari com o app instalado.');
    }
  } catch(e){
    console.error(e);
    toast('Erro: ' + e.message);
  }
}


/* ===================== CONEXÃO COM O BACKEND (Google Sheets / Apps Script) ===================== */
// Cole aqui a URL gerada ao implantar o Apps Script como "App da Web" (termina em /exec)
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbxFM24l8mcGtn8vVskFHswd3ZWGzIqOqArTI8Qxr3V77Xh6is4vlhiESbmJcG393lU1cw/exec';

async function apiGet(){
  const res = await fetch(API_BASE_URL);
  return res.json();
}
async function apiPost(action, data){
  // Anexa o token de sessão do admin automaticamente em toda chamada feita
  // enquanto logado como admin — o servidor confere esse token em toda ação
  // restrita (ver Code.gs, requireAdmin_). Sem isso, ações administrativas
  // seriam chamáveis por qualquer um, só sabendo o nome da ação.
  const payload = state.adminToken ? { ...data, adminToken: state.adminToken } : data;
  const res = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita pre-flight CORS no Apps Script
    body: JSON.stringify({ action, data: payload })
  });
  return res.json();
}

/* ===================== DADOS (carregados do backend) ===================== */
let services = [];

// Lista mestre de categorias possíveis (usada no formulário de cadastro de serviço no admin)
const masterCategories = ['Cabelo','Barba','Unhas','Estética'];

// Paleta usada para gerar o avatar de novos colaboradores cadastrados pelo admin
const avatarPalette = [
  ['#c4503a','#5e211a'], ['#d6604a','#6b2a1d'], ['#b8442f','#4a1812'],
  ['#a83f2c','#3a1410'], ['#c8593f','#572218'], ['#9c3f2e','#33120e'],
];

let professionals = [];

// Usuário/senha do admin são validados no backend (saveAdminPass/adminLogin em Code.gs),
// com a senha guardada com hash — assim funciona em qualquer dispositivo/navegador.

// Configuração de funcionamento — valores padrão de segurança até o backend responder
let businessConfig = {
  interval: 30,
  breakStart: '12:00',
  breakEnd: '13:00',
  bookingWindow: 30,
  blockedRanges: [],
  blockedSlots: [],
  breaks: {},
  hours: {
    0: {closed:true,  open:'08:00', close:'18:00'},
    1: {closed:true,  open:'08:00', close:'18:00'},
    2: {closed:false, open:'08:00', close:'18:00'},
    3: {closed:false, open:'08:00', close:'18:00'},
    4: {closed:false, open:'08:00', close:'18:00'},
    5: {closed:false, open:'07:30', close:'20:00'},
    6: {closed:false, open:'07:30', close:'18:00'},
  }
};

const weekdayLabel = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const weekdayFull  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

let bookings = [];
let myBookings = []; // agendamentos do cliente logado (com nome/telefone), carregados à parte dos públicos
let validatedBookingIds = new Set();

let state = {
  loggedIn:false, isAdmin:false, userName:'Cliente', userPhone:null, adminToken:null,
  activeCategory:'Todos',
  selectedService:null, selectedProf:null, selectedDate:null, selectedSlot:null, selectedPayment:null,
};
let editingStaffId = null;
let editingServiceId = null;
let selectedAgendaStaff = null;

/* ===================== CARREGAMENTO DE DADOS ===================== */
async function loadData(){
  const data = await apiGet();
  if(data.error) throw new Error(data.error);
  services = data.services;
  professionals = data.professionals;
  businessConfig = data.businessConfig;
  bookings = data.bookings;
  validatedBookingIds = new Set((data.validatedBookingIds || []).map(String));
}

function renderHeroHours(){
  const wrap = document.getElementById('heroHours');
  if(!wrap) return;
  wrap.innerHTML = [0,1,2,3,4,5,6].map(dow => {
    const cfg = businessConfig.hours[dow];
    const brk = businessConfig.breaks ? businessConfig.breaks[dow] : null;
    let label = 'Fechado';
    if(!cfg.closed){
      label = `${cfg.open}–${cfg.close}`;
      if(brk && brk.active && brk.open2 && brk.close2) label += `, ${brk.open2}–${brk.close2}`;
    }
    return `<div class="hero-hours-row"><span>${weekdayFull[dow]}</span><span>${label}</span></div>`;
  }).join('');
}

/* ===================== HELPERS ===================== */
function isoOffset(days){
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function fmtDateLong(iso){
  const d = new Date(iso+'T00:00');
  return `${weekdayFull[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}`;
}
// Escapa texto vindo de cliente (ex: nome no cadastro) antes de inserir via innerHTML —
// sem isso, alguém poderia se cadastrar com um nome tipo "<img src=x onerror=...>" e
// rodar script na sessão de quem visse esse nome (inclusive o admin no painel).
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Mesma ideia, mas pra quando o texto vai dentro de um atributo onclick="...('valor')" —
// primeiro escapa pra não quebrar a string JS, depois escapa pra não quebrar o atributo HTML.
function escapeForJsAttr(str){
  const jsEscaped = String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return escapeHtml(jsEscaped);
}
function toast(msg, duration=2200){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), duration);
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('bottomNav').style.display =
    ['screen-login','screen-admin-login','screen-register'].includes(id) ? 'none' : 'flex';
  window.scrollTo(0,0);
}
function setNav(which){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(which==='home') document.getElementById('navHome').classList.add('active');
  if(which==='appointments') document.getElementById('navAppt').classList.add('active');
  if(which==='profile') document.getElementById('navProfile').classList.add('active');
  if(which==='admin') document.getElementById('navAdmin').classList.add('active');
}

/* ===================== COMPARTILHAR LINK ===================== */
function openShareModal(){
  const link = window.location.origin + window.location.pathname;
  document.getElementById('shareLinkBox').textContent = link;
  document.getElementById('shareModalOverlay').classList.add('show');
}
function closeShareModalDirect(){
  document.getElementById('shareModalOverlay').classList.remove('show');
}
function closeShareModal(e){
  if(e.target === document.getElementById('shareModalOverlay')) closeShareModalDirect();
}
function shareOnWhatsApp(){
  const link = document.getElementById('shareLinkBox').textContent;
  const msg = encodeURIComponent(`Olá! Agora você pode agendar seu horário na Barbearia Monteiro de forma rápida e fácil pelo nosso app. Acesse aqui: ${link}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}
function copyShareLink(){
  const link = document.getElementById('shareLinkBox').textContent;
  navigator.clipboard.writeText(link).then(() => {
    toast('✅ Link copiado!');
    closeShareModalDirect();
  }).catch(() => {
    toast('Erro ao copiar. Copie manualmente.');
  });
}

/* ===================== CARTÃO FIDELIDADE ===================== */
const LOYALTY_TOTAL = 11;

function buildLoyaltySealsHTML(total){
  // Linha 1: selos 1-5
  let row1 = '';
  for(let i = 1; i <= 5; i++){
    const filled = i <= total;
    const is5 = i === 5;
    let cls = `loyalty-seal ${filled ? 'filled' : 'empty'}`;
    if(is5) cls += ' special-5';
    const icon = filled ? `<img src="logo-monteiro.jpeg" alt="Monteiro" style="width:78%;height:78%;object-fit:contain;border-radius:50%;mix-blend-mode:luminosity;opacity:.95;">` : '';
    const badge = is5 ? `<span class="discount-badge">10% OFF</span>` : '';
    row1 += `<div class="${cls}">${icon}<span class="seal-num">${i}</span>${badge}</div>`;
  }
  // Linha 2: selos 6-11
  let row2 = '';
  for(let i = 6; i <= LOYALTY_TOTAL; i++){
    const filled = i <= total;
    const is11 = i === 11;
    let cls = `loyalty-seal ${filled ? 'filled' : 'empty'}`;
    if(is11) cls += ' special-11';
    const icon = filled
      ? (is11 ? `<span style="font-size:1.3rem;">🎁</span>`
               : `<img src="logo-monteiro.jpeg" alt="Monteiro" style="width:78%;height:78%;object-fit:contain;border-radius:50%;mix-blend-mode:luminosity;opacity:.95;">`)
      : (is11 ? `<span class="gift-icon">🎁</span>` : '');
    const badge = is11 ? `<span class="discount-badge">GRÁTIS</span>` : '';
    row2 += `<div class="${cls}">${icon}<span class="seal-num">${i}</span>${badge}</div>`;
  }
  return row1 + `<div class="loyalty-row-2">${row2}</div>`;
}

function buildLoyaltyNextMsg(total){
  if(total >= LOYALTY_TOTAL)
    return { text:'🎉 Parabéns! Você ganhou um serviço GRÁTIS!', bg:'rgba(63,174,102,.15)', border:'rgba(63,174,102,.4)', color:'var(--green-bright)' };
  if(total >= 6){
    const rem = LOYALTY_TOTAL - total;
    return { text:`Faltam ${rem} visita${rem>1?'s':''} para seu serviço GRÁTIS!`, bg:'rgba(196,60,45,.1)', border:'rgba(196,60,45,.2)', color:'var(--red-bright)' };
  }
  const rem5 = 6 - total;
  return { text:`Faltam ${rem5} visita${rem5>1?'s':''} para 10% OFF no seu próximo corte!`, bg:'rgba(196,60,45,.1)', border:'rgba(196,60,45,.2)', color:'var(--red-bright)' };
}

// `visits` já vem do backend ordenado do mais recente para o mais antigo. Numeramos
// pela posição real no ciclo (1 = primeira visita) pra bater com os selos do cartão
// acima, que preenchem 1→total na ordem cronológica.
function buildHistoryHTML(visits){
  if(!visits.length) return `<div class="empty-note" style="padding:0;">Nenhuma visita validada ainda.</div>`;
  return visits.map((v, idx) => {
    const num = visits.length - idx;
    const d = new Date(v.date + 'T00:00');
    const dateStr = `${weekdayLabel[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    return `<div class="loyalty-history-item">
      <div class="loyalty-history-num">${num}</div>
      <div class="loyalty-history-info">
        <strong>${v.serviceName || 'Atendimento'}</strong>
        <span>${dateStr}</span>
      </div>
    </div>`;
  }).join('');
}

async function loadLoyalty(){
  if(!state.userPhone) return;
  const res = await apiPost('getLoyalty', { phone: state.userPhone });
  if(res.error){ console.warn(res.error); renderLoyaltyCard(0, []); return; }
  renderLoyaltyCard(res.total || 0, res.visits || []);
}

function renderLoyaltyCard(total, visits){
  const pct = Math.min((total / LOYALTY_TOTAL) * 100, 100);
  const msg = buildLoyaltyNextMsg(total);
  document.getElementById('loyaltyBadge').textContent = `${total}/${LOYALTY_TOTAL}`;
  document.getElementById('loyaltyBar').style.width = pct + '%';
  const nextEl = document.getElementById('loyaltyNext');
  nextEl.textContent = msg.text;
  nextEl.style.background = msg.bg;
  nextEl.style.borderColor = msg.border;
  nextEl.style.color = msg.color;
  document.getElementById('loyaltyGrid').innerHTML = buildLoyaltySealsHTML(total);
  document.getElementById('loyaltyHistory').innerHTML = buildHistoryHTML(visits);
}

// Formata um telefone já completo pra exibição. Trata 10 e 11 dígitos (a
// maioria dos celulares tem 11, mas alguns clientes cadastraram sem o 9º
// dígito) — sem isso, um número de 10 dígitos ficava com o corte errado.
function formatPhoneBR(digits){
  const d = String(digits || '').replace(/\D/g,'');
  if(d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if(d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return d ? `(${d.slice(0,2)}) ${d.slice(2)}` : '';
}

/* ===================== AUTH (celular + senha) ===================== */
function maskPhone(el){
  let d = el.value.replace(/\D/g,'').slice(0,11);
  if(d.length>10) el.value = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  else if(d.length>6) el.value = `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  else if(d.length>2) el.value = `(${d.slice(0,2)}) ${d.slice(2)}`;
  else if(d.length>0) el.value = `(${d}`;
  else el.value = '';
}
async function doLogin(){
  const digits = document.getElementById('loginPhone').value.replace(/\D/g,'');
  const pass = document.getElementById('loginPass').value;
  if(digits.length < 10){ toast('Digite um celular válido com DDD'); return; }
  if(!pass){ toast('Digite sua senha'); return; }
  toast('Entrando...');
  const res = await apiPost('login', { phone: digits, password: pass });
  if(res.error){ toast(res.error); return; }
  state.userName = res.name;
  state.userPhone = res.phone;
  await finishLogin();
  toast('Bem-vindo(a) de volta!');
}
async function doRegister(){
  const name = document.getElementById('regName').value.trim();
  const digits = document.getElementById('regPhone').value.replace(/\D/g,'');
  const pass = document.getElementById('regPass').value;
  if(!name){ toast('Digite seu nome'); return; }
  if(digits.length !== 11){ toast('Digite um celular válido com DDD e 9 dígitos'); return; }
  if(!pass || pass.length < 4){ toast('A senha precisa de ao menos 4 caracteres'); return; }
  toast('Criando conta...');
  const res = await apiPost('register', { name, phone: digits, password: pass });
  if(res.error){ toast(res.error); return; }
  state.userName = res.name;
  state.userPhone = res.phone;
  await finishLogin();
  toast('Conta criada com sucesso!');
}
const SESSION_KEY = 'monteiro_session_v1';
function saveSession(){
  try{
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      isAdmin: state.isAdmin,
      userName: state.userName,
      userPhone: state.userPhone,
      adminToken: state.adminToken,
    }));
  } catch(e){}
}
function clearSession(){
  try{ localStorage.removeItem(SESSION_KEY); } catch(e){}
}
function restoreSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    if(!raw) return false;
    return JSON.parse(raw);
  } catch(e){ return false; }
}

async function finishLogin(){
  state.loggedIn = true; state.isAdmin = false;
  document.getElementById('homeUserName').textContent = capitalize(state.userName.split(' ')[0]);
  document.getElementById('navAdmin').style.display = 'none';
  renderCategoryChips(); renderServices();
  showScreen('screen-home'); setNav('home');
  updateReminderBanner();
  saveSession();
  await loadMyBookings();
}

// Agendamentos do cliente logado (com nome/telefone) — carregados à parte da
// lista pública (que não traz dados pessoais de ninguém). Basta o telefone,
// igual ao "getLoyalty" já usado pra consultar o próprio cartão fidelidade.
async function loadMyBookings(){
  if(!state.userPhone){ myBookings = []; return; }
  const res = await apiPost('getMyBookings', { phone: state.userPhone });
  myBookings = res.error ? [] : (res.bookings || []);
}
let pendingFirstAccessToken = null; // token de curta duração devolvido pelo login com a senha padrão, usado só pra completar a troca de senha

async function doAdminLogin(){
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value;
  toast('Entrando...');
  const res = await apiPost('adminLogin', { user: u, pass: p });
  if(res.error){ toast(res.error); return; }
  document.getElementById('adminPass').value = '';
  if(res.firstAccess){
    pendingFirstAccessToken = res.firstAccessToken;
    showScreen('screen-admin-first-access');
    return;
  }
  state.adminToken = res.token;
  await enterAdmin();
  toast('Bem-vindo, administrador');
}

async function saveNewAdminPass(){
  const newPass = document.getElementById('newAdminPass').value;
  const confirmPass = document.getElementById('confirmAdminPass').value;
  if(newPass.length < 6){ toast('A senha deve ter pelo menos 6 caracteres'); return; }
  if(newPass !== confirmPass){ toast('As senhas não coincidem'); return; }
  toast('Salvando...');
  const res = await apiPost('saveAdminPass', { pass: newPass, firstAccessToken: pendingFirstAccessToken });
  if(res.error){ toast('Erro: ' + res.error); return; }
  pendingFirstAccessToken = null;
  document.getElementById('newAdminPass').value = '';
  document.getElementById('confirmAdminPass').value = '';
  toast('✅ Senha definida com sucesso!');
  state.adminToken = res.token;
  await enterAdmin();
}
async function enterAdmin(){
  // Reconfirma o token com o servidor e já traz os agendamentos completos
  // (com nome/telefone) — só disponíveis pra quem tem token de admin válido.
  const res = await apiPost('getAdminBookings', {});
  if(res.error){
    state.adminToken = null;
    clearSession();
    showScreen('screen-admin-login');
    toast('Sessão de administrador expirada. Faça login novamente.');
    return;
  }
  bookings = res.bookings;
  state.isAdmin = true;
  clientesCache = [];
  document.getElementById('navAdmin').style.display = 'flex';
  document.getElementById('navProfile').style.display = 'none';
  document.getElementById('navHome').style.display = 'none';
  document.getElementById('navAppt').style.display = 'none';
  renderAdminDays();
  setAdminTab('hours');
  showScreen('screen-admin');
  document.getElementById('bottomNav').style.display = 'flex';
  setNav('admin');
  updateReminderBanner();
  saveSession();
}
function capitalize(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
function logoutUser(){
  state.loggedIn = false; state.isAdmin = false; state.userPhone = null; state.adminToken = null;
  state.selectedService = null; state.selectedProf = null; state.selectedDate = null; state.selectedSlot = null;
  myBookings = [];
  document.getElementById('navAdmin').style.display = 'none';
  document.getElementById('navProfile').style.display = 'flex';
  document.getElementById('navHome').style.display = 'flex';
  document.getElementById('navAppt').style.display = 'flex';
  clearSession();
  loadData(); // recarrega a versão pública (sem dados pessoais) por cima do que o admin tinha em memória
  showScreen('screen-login');
  toast('Você saiu da conta');
}


/* ===================== HOME / SERVICES ===================== */
function activeCategories(){
  // Só mostra categorias que ainda têm pelo menos 1 serviço cadastrado
  const present = [...new Set(services.map(s => s.cat))];
  return ['Todos', ...masterCategories.filter(c => present.includes(c))];
}
function renderCategoryChips(){
  const cats = activeCategories();
  if(!cats.includes(state.activeCategory)) state.activeCategory = 'Todos';
  const wrap = document.getElementById('categoryChips');
  wrap.innerHTML = cats.map(c =>
    `<div class="chip ${c===state.activeCategory?'active':''}" onclick="setCategory('${c}')">${c}</div>`
  ).join('');
}
function setCategory(c){ state.activeCategory = c; renderCategoryChips(); renderServices(); }

/* ===================== PLANOS MENSAIS ===================== */
// Conteúdo fixo (não vem do backend) — pacotes recorrentes vendidos à parte dos
// serviços avulsos. Pedido feito pelo WhatsApp da barbearia até existir um fluxo
// de assinatura de verdade no app.
// comboServiceName precisa bater exatamente com o nome de um serviço cadastrado
// pelo admin na aba Serviços (duração = soma dos serviços do combo, preço R$0
// porque já foi pago à vista no Pix ao contratar o plano).
const SERVICE_PLANS = [
  { id:'bronze',   name:'Bronze',   price:110, img:'plan-bronze.png',   accent:'var(--plan-bronze)',   accentDim:'rgba(201,138,82,.25)',  services:['4x Corte'],                          comboServiceName:'Combo Bronze' },
  { id:'gold',     name:'Gold',     price:140, img:'plan-gold.png',     accent:'var(--plan-gold)',     accentDim:'rgba(232,184,76,.25)',  services:['4x Corte','4x Sobrancelha'],         comboServiceName:'Combo Gold' },
  { id:'platinum', name:'Platinum', price:220, img:'plan-platinum.png', accent:'var(--plan-platinum)', accentDim:'rgba(207,214,218,.25)', services:['4x Corte','4x Barba','4x Sobrancelha'], comboServiceName:'Combo Platinum' },
];
function renderServicePlans(){
  const wrap = document.getElementById('plansRow');
  if(!wrap) return;
  wrap.innerHTML = SERVICE_PLANS.map(p => `
    <div class="plan-card" style="--plan-accent:${p.accent}; --plan-accent-dim:${p.accentDim};">
      <div class="plan-card-top">
        <img class="plan-badge-img" src="${p.img}" alt="Selo do plano ${p.name}" loading="lazy">
        <div class="plan-heading">
          <span class="plan-name">${p.name}</span>
          <span class="plan-price">R$ ${p.price}<small> /mês</small></span>
        </div>
      </div>
      <ul class="plan-checklist">
        ${p.services.map(s => `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>${s}</li>`).join('')}
      </ul>
      <p class="plan-freq">Podendo cortar 1x por semana (4x no mês) · Terça a Sexta</p>
      <div class="plan-warning">⚠️ Marcou e não veio, perde o dia da semana.</div>
      <button class="plan-cta" onclick="openPlanPixModal('${p.id}')">Quero esse plano</button>
    </div>
  `).join('');
}

function renderServices(){
  const term = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const list = services.filter(s =>
    (state.activeCategory === 'Todos' || s.cat === state.activeCategory) &&
    s.name.toLowerCase().includes(term)
  );
  const wrap = document.getElementById('serviceList');
  wrap.innerHTML = list.length ? list.map(s => `
    <div class="service-card" data-service-id="${s.id}">
      ${s.imageUrl
        ? `<img class="service-thumb" src="${s.imageUrl}" alt="${s.name}">`
        : `<div class="service-bar"></div>`
      }
      <div class="service-info">
        <h3>${s.name}</h3>
        <p>${s.cat} · ${s.duration} min</p>
      </div>
      <div class="service-price">
        <strong>R$ ${s.price}</strong>
        <button class="mini-btn" data-book="${s.id}">+</button>
      </div>
    </div>
  `).join('') : `<div class="empty-note">Nenhum serviço encontrado.</div>`;
}

// Event delegation único para botão de agendamento
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-book]');
  if(!btn) return;
  openBooking(Number(btn.dataset.book));
});

/* ===================== BOOKING FLOW ===================== */
function eligibleProfessionals(serviceId){
  return professionals.filter(p => p.serviceIds && p.serviceIds.includes(Number(serviceId)));
}
function openBooking(serviceId){
  const id = Number(serviceId);
  
  if(!state.loggedIn){ showScreen('screen-login'); return; }
  
  const svc = services.find(s => Number(s.id) === id);
  if(!svc){ toast('Serviço não encontrado'); return; }
  
  state.selectedService = svc;
  const eligible = professionals.filter(p => Array.isArray(p.serviceIds) && p.serviceIds.map(Number).includes(id));
  state.selectedProf = eligible.length ? eligible[0].id : null;
  state.selectedDate = isoOffset(0);
  state.selectedSlot = null;
  state.selectedPayment = null;
  clientCalYear  = new Date().getFullYear();
  clientCalMonth = new Date().getMonth();

  document.getElementById('bkServiceName').textContent = svc.name;
  document.getElementById('bkServiceMeta').textContent = `${svc.duration} min · ${svc.cat}`;
  document.getElementById('bkServicePrice').textContent = `R$ ${svc.price}`;
  document.getElementById('bkTotal').textContent = `R$ ${svc.price}`;

  renderProfessionals();
  renderClientCal();
  renderSlots();
  updateConfirmBtn();
  showScreen('screen-booking');
}

function renderProfessionals(){
  const wrap = document.getElementById('profRow');
  const eligible = eligibleProfessionals(state.selectedService.id);
  if(!eligible.length){
    wrap.innerHTML = `<div class="empty-note">Nenhum colaborador disponível para este serviço no momento.</div>`;
    return;
  }
  wrap.innerHTML = eligible.map(p => `
    <div class="prof-card ${p.id===state.selectedProf?'active':''}" onclick="selectProf(${p.id})">
      <div class="prof-avatar" style="background:linear-gradient(135deg, ${p.c1}, ${p.c2});">${p.initials}</div>
      <span>${p.name}</span>
      <small>${p.role}</small>
    </div>
  `).join('');
}
function selectProf(id){
  state.selectedProf = id; state.selectedSlot = null;
  renderProfessionals(); renderSlots(); updateConfirmBtn();
}

function toHHmm(val){
  if(!val && val !== 0) return '00:00';
  try{
    if(typeof val === 'string' && val.match(/^\d{1,2}:\d{2}/)) return val.slice(0,5);
    if(typeof val === 'number'){
      // Fração do dia (Google Sheets time serial)
      const totalMin = Math.round(val * 24 * 60);
      const h = Math.floor(totalMin / 60) % 24;
      const m = totalMin % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    const d = new Date(val);
    if(isNaN(d.getTime())) return '00:00';
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch(e){ return '00:00'; }
}

function generateSlots(dateIso, profId){
  const dow = new Date(dateIso+'T00:00').getDay();
  const cfg = businessConfig.hours[dow];
  if(!cfg || cfg.closed) return [];

  const [oh,om] = toHHmm(cfg.open).split(':').map(Number);
  const [ch,cm] = toHHmm(cfg.close).split(':').map(Number);

  // Define os blocos de atendimento
  const blocks = [{ start: oh*60+om, end: ch*60+cm }];
  const brk = businessConfig.breaks ? businessConfig.breaks[dow] : null;
  if(brk && brk.active && brk.open2 && brk.close2){
    // Com 2° período: o 1° bloco vai só até o início do 2° período
    // O admin configura: open (abre), close (fecha 1° período) no "Dias e horários"
    // E open2 (abre 2° período), close2 (fecha 2° período) no "Horários de atendimento"
    const [o2h,o2m] = brk.open2.split(':').map(Number);
    const [c2h,c2m] = brk.close2.split(':').map(Number);
    // Ajusta o 1° bloco para terminar onde o admin definiu (close do dia)
    // e adiciona o 2° bloco
    blocks[0].end = oh*60+om < o2h*60+o2m ? Math.min(ch*60+cm, o2h*60+o2m) : ch*60+cm;
    if(o2h*60+o2m < c2h*60+c2m) blocks.push({ start: o2h*60+o2m, end: c2h*60+c2m });
  }

  const today  = isoOffset(0);
  const now    = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes() + 30;
  const isToday = dateIso === today;
  const blockedSlots = businessConfig.blockedSlots || [];

  const slots = [];
  // Monta um Set de todos os minutos ocupados por agendamentos existentes
  // levando em conta a duração de cada serviço já marcado
  const occupiedMins = new Set();
  bookings.filter(b => b.profId === profId && b.date === dateIso).forEach(b => {
    const booked = services.find(s => s.id === Number(b.serviceId));
    const dur = booked ? Number(booked.duration) : businessConfig.interval;
    const [bh, bm] = (b.time||'00:00').split(':').map(Number);
    const start = bh*60+bm;
    for(let t = start; t < start + dur; t += businessConfig.interval){
      occupiedMins.add(t);
    }
  });

  // Duração do serviço que está sendo consultado agora
  const serviceDuration = state.selectedService ? Number(state.selectedService.duration) : businessConfig.interval;

  for(const block of blocks){
    let cur = block.start;
    while(cur + businessConfig.interval <= block.end){
      const h    = String(Math.floor(cur/60)).padStart(2,'0');
      const m    = String(cur%60).padStart(2,'0');
      const time = `${h}:${m}`;
      const pastToday = isToday && cur < nowMin;
      const onBlockedSlot = blockedSlots.some(s => {
        if(s.date !== dateIso) return false;
        const [fh,fm] = s.from.split(':').map(Number);
        const [th,tm] = s.to.split(':').map(Number);
        return cur >= fh*60+fm && cur < th*60+tm;
      });
      // Verifica se todos os minutos necessários para o serviço estão livres
      let taken = false;
      for(let t = cur; t < cur + serviceDuration; t += businessConfig.interval){
        if(occupiedMins.has(t)){ taken = true; break; }
      }
      // Verifica se o serviço cabe dentro do bloco (não ultrapassa o horário de fechamento)
      const fitsInBlock = (cur + serviceDuration) <= block.end;
      slots.push({ time, available: !taken && !pastToday && !onBlockedSlot && fitsInBlock });
      cur += businessConfig.interval;
    }
  }
  return slots;
}

function isDateBlocked(iso){
  const ranges = businessConfig.blockedRanges || [];
  return ranges.some(r => iso >= r.from && iso <= r.to);
}

let clientCalYear  = new Date().getFullYear();
let clientCalMonth = new Date().getMonth();

function clientCalPrev(){
  clientCalMonth--;
  if(clientCalMonth < 0){ clientCalMonth = 11; clientCalYear--; }
  renderClientCal();
}
function clientCalNext(){
  clientCalMonth++;
  if(clientCalMonth > 11){ clientCalMonth = 0; clientCalYear++; }
  renderClientCal();
}
function clientCalToday(){
  clientCalYear  = new Date().getFullYear();
  clientCalMonth = new Date().getMonth();
  state.selectedDate = isoOffset(0);
  renderClientCal();
  renderSlots();
  updateConfirmBtn();
}
function renderClientCal(){
  const label = document.getElementById('clientCalMonthLabel');
  const grid  = document.getElementById('clientCalGrid');
  if(!label || !grid) return;
  label.textContent = `${monthNames[clientCalMonth]} ${clientCalYear}`;

  const today   = isoOffset(0);
  const maxDays = Number(businessConfig.bookingWindow) || 30;
  const maxDate = isoOffset(maxDays);
  const now     = new Date();
  const nowMin  = now.getHours()*60 + now.getMinutes() + 30;

  const firstDay    = new Date(clientCalYear, clientCalMonth, 1).getDay();
  const daysInMonth = new Date(clientCalYear, clientCalMonth + 1, 0).getDate();
  const daysInPrev  = new Date(clientCalYear, clientCalMonth, 0).getDate();

  let html = '';
  // Dias do mês anterior (cinza)
  for(let i = firstDay - 1; i >= 0; i--){
    html += `<div class="cal-day other-month"></div>`;
  }
  // Dias do mês atual
  for(let d = 1; d <= daysInMonth; d++){
    const iso = `${clientCalYear}-${String(clientCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(iso+'T00:00').getDay();
    const cfg = businessConfig.hours[dow];
    const isClosed  = !cfg || cfg.closed;
    const isBlocked = isDateBlocked(iso);
    const isPast    = iso < today;
    const isFuture  = iso > maxDate;
    // Hoje sem slots disponíveis
    let noSlots = false;
    if(iso === today && cfg && !cfg.closed){
      const brk = businessConfig.breaks ? businessConfig.breaks[dow] : null;
      // Se tem 2° período (almoço), o fechamento de verdade é o close2, não o cfg.close
      // (que é só o fim do 1° período) — senão "hoje" ficava marcado como sem horários
      // assim que passasse do horário de almoço, mesmo com vagas à tarde.
      const effectiveClose = (brk && brk.active && brk.close2) ? brk.close2 : cfg.close;
      const [ch,cm] = toHHmm(effectiveClose).split(':').map(Number);
      noSlots = nowMin >= ch*60+cm;
    }
    const isSelected = iso === state.selectedDate;
    const isToday    = iso === today;
    const disabled   = isClosed || isBlocked || isPast || isFuture || noSlots;
    let cls = 'cal-day';
    if(isSelected) cls += ' selected';
    else if(isToday) cls += ' today';
    if(disabled) cls += ' closed';
    html += `<div class="${cls}" onclick="${disabled?'':`clientCalSelectDay('${iso}')`}">${d}</div>`;
  }
  // Completar última semana
  const total = firstDay + daysInMonth;
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for(let d = 1; d <= rem; d++){
    html += `<div class="cal-day other-month"></div>`;
  }
  grid.innerHTML = html;
}
function clientCalSelectDay(iso){
  state.selectedDate = iso;
  state.selectedSlot = null;
  renderClientCal();
  renderSlots();
  updateConfirmBtn();
}
function selectDate(iso){ clientCalSelectDay(iso); }

function renderSlots(){
  const wrap = document.getElementById('slotWrap');
  if(!state.selectedProf){
    wrap.innerHTML = `<div class="empty-note">Selecione um colaborador disponível para ver os horários.</div>`;
    return;
  }
  const slots = generateSlots(state.selectedDate, state.selectedProf);
  if(!slots.length){
    wrap.innerHTML = `<div class="empty-note">Fechado neste dia. Escolha outra data.</div>`;
    return;
  }
  wrap.innerHTML = `<div class="slot-grid">${slots.map(s => `
    <div class="slot ${s.time===state.selectedSlot?'active':''} ${!s.available?'taken':''}"
         onclick="${s.available?`selectSlot('${s.time}')`:''}">${s.time}</div>
  `).join('')}</div>`;
}
function selectSlot(time){
  state.selectedSlot = time;
  renderSlots(); updateConfirmBtn();
}
function selectPayment(method){
  state.selectedPayment = method;
  document.querySelectorAll('.payment-chip').forEach(c => c.classList.remove('active'));
  const el = document.getElementById('pay-' + method);
  if(el) el.classList.add('active');
  updateConfirmBtn();
}
function updateConfirmBtn(){
  document.getElementById('confirmBtn').disabled = !state.selectedSlot || !state.selectedProf || !state.selectedPayment;
}

async function confirmBooking(){
  const prof = professionals.find(p=>p.id===state.selectedProf);
  if(!prof){ toast('Selecione um colaborador antes de confirmar'); return; }
  const btn = document.getElementById('confirmBtn');
  if(btn.disabled) return; // evita duplo-clique disparar duas reservas
  btn.disabled = true;
  const payload = {
    serviceId: state.selectedService.id,
    profId: state.selectedProf,
    date: state.selectedDate,
    time: state.selectedSlot,
    clientName: state.userName || 'Cliente',
    clientPhone: state.userPhone || '',
    payment: state.selectedPayment || 'Não informado',
    source: 'client'
  };
  toast('Agendando...');
  const res = await apiPost('addBooking', payload);
  if(res.error){
    toast(res.error);
    updateConfirmBtn(); // reabilita conforme o estado atual da seleção
    if(res.error.includes('reservado por outra pessoa')) renderSlots(); // atualiza a grade de horários
    return;
  }
  bookings.push({ id: res.id, serviceId: payload.serviceId, profId: payload.profId, date: payload.date, time: payload.time });
  myBookings.push({ id: res.id, ...payload });

  document.getElementById('successModalDetails').innerHTML = `
    <div class="confirm-row"><span>Serviço</span><strong>${state.selectedService.name}</strong></div>
    <div class="confirm-row"><span>Profissional</span><strong>${prof.name}</strong></div>
    <div class="confirm-row"><span>Data</span><strong>${fmtDateLong(state.selectedDate)}</strong></div>
    <div class="confirm-row"><span>Horário</span><strong>${state.selectedSlot}</strong></div>
    <div class="confirm-row"><span>Valor</span><strong>R$ ${state.selectedService.price}</strong></div>
  `;
  document.getElementById('successModal').classList.add('show');
}
function closeSuccessModal(){
  document.getElementById('successModal').classList.remove('show');
  showScreen('screen-appointments');
  setNav('appointments');
  renderAppointments();
}

/* ===================== APPOINTMENTS ===================== */
function renderAppointments(){
  updateReminderBanner();
  const wrap = document.getElementById('apptList');
  const upcoming = [...myBookings].sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  if(!upcoming.length){
    wrap.innerHTML = `<div class="empty-note">Você ainda não tem agendamentos.</div>`;
    return;
  }
  wrap.innerHTML = upcoming.map(b => {
    const s = services.find(x=>x.id===b.serviceId);
    const p = professionals.find(x=>x.id===b.profId);
    const d = new Date(b.date+'T00:00');
    return `
      <div class="appt-card">
        <div class="appt-date"><span>${weekdayLabel[d.getDay()]}</span><strong>${String(d.getDate()).padStart(2,'0')}</strong></div>
        <div class="appt-info">
          <h3>${s ? s.name : 'Serviço'}</h3>
          <p>${p ? p.name : ''} · ${b.time}</p>
        </div>
        <div class="appt-status">Confirmado</div>
      </div>
      <div class="appt-actions"><button class="link-danger" onclick="cancelBooking(${b.id})">Cancelar agendamento</button></div>
    `;
  }).join('');
}
async function cancelBooking(id){
  const res = await apiPost('cancelBooking', { id, source: 'client', phone: state.userPhone });
  if(res.error){ toast(res.error); return; }
  bookings = bookings.filter(b=>b.id!==id);
  myBookings = myBookings.filter(b=>b.id!==id);
  renderAppointments();
  toast('Agendamento cancelado');
}
function openWhatsApp(url){
  window.open(url, '_blank');
}

/* ===================== MODAL ASSINATURA ===================== */
const PLANOS = {
  mensal:   { nome: 'Plano Mensal',    valor: 'R$ 40',  valorNum: 40,  desc: 'Cobrado todo mês' },
  semestral:{ nome: 'Plano Semestral', valor: 'R$ 210', valorNum: 210, desc: 'R$ 35/mês · Economia de R$ 30' },
  anual:    { nome: 'Plano Anual',     valor: 'R$ 360', valorNum: 360, desc: 'R$ 30/mês · Economia de R$ 120' },
};
let planoSelecionado = null;

function openAssinaturaModal(){
  document.getElementById('assinaturaModal').style.display = 'flex';
  document.getElementById('assinaturaPlanos').style.display = 'block';
  document.getElementById('assinaturaPagamento').style.display = 'none';
  document.body.style.overflow = 'hidden';
}
function closeAssinaturaModal(){
  document.getElementById('assinaturaModal').style.display = 'none';
  document.body.style.overflow = '';
}
function voltarPlanos(){
  document.getElementById('assinaturaPlanos').style.display = 'block';
  document.getElementById('assinaturaPagamento').style.display = 'none';
}
function selecionarPlano(tipo){
  planoSelecionado = PLANOS[tipo];
  document.getElementById('assinaturaPlanoNome').textContent = planoSelecionado.nome;
  document.getElementById('assinaturaValor').textContent = planoSelecionado.valor;
  document.getElementById('assinaturaValorInline').textContent = planoSelecionado.valor;
  document.getElementById('assinaturaDescricao').textContent = planoSelecionado.desc;
  document.getElementById('assinaturaPlanos').style.display = 'none';
  document.getElementById('assinaturaPagamento').style.display = 'block';
}
function enviarComprovantePlano(){
  if(!planoSelecionado) return;
  const msg = encodeURIComponent(`Ola Felipe! Acabei de pagar ${planoSelecionado.valor} referente ao ${planoSelecionado.nome} do app Monteiro Barbearia. Segue o comprovante em anexo.`);
  window.open(`https://wa.me/5519981862800?text=${msg}`, '_blank');
  closeAssinaturaModal();
  toast('Comprovante enviado! Ativação em até 24h.');
}
function openPixModal(){
  const modal = document.getElementById('pixModal');
  if(!modal) return;
  // Preenche valor e serviço do agendamento atual
  const price = state.selectedService ? state.selectedService.price : 0;
  const name  = state.selectedService ? state.selectedService.name : '—';
  const el1 = document.getElementById('pixAmount');
  const el2 = document.getElementById('pixAmountInline');
  const el3 = document.getElementById('pixServiceName');
  if(el1) el1.textContent = `R$ ${price}`;
  if(el2) el2.textContent = `R$ ${price}`;
  if(el3) el3.textContent = name;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closePixModal(){
  const modal = document.getElementById('pixModal');
  if(modal){ modal.style.display = 'none'; document.body.style.overflow = ''; }
  pendingPlan = null; // se o cliente fechar sem confirmar, não deixa "vazar" pro próximo pagamento
}
function copyPixCode(){
  const code = '00020101021126330014br.gov.bcb.pix0111422780858835204000053039865802BR5919DENIS M DA S DANTAS6011HORTOLANDIA62070503***6304400B';
  navigator.clipboard.writeText(code).then(() => toast('Código Pix copiado!')).catch(() => toast('Copie manualmente o código'));
}

// Plano mensal pendente de pagamento (preenchido por openPlanPixModal). O modal de
// Pix é o mesmo usado pra pagar um serviço avulso — o QR/código é o mesmo em
// qualquer valor (o cliente digita o valor na hora de pagar), só o texto muda.
let pendingPlan = null;
function openPlanPixModal(planId){
  const plan = SERVICE_PLANS.find(p => p.id === planId);
  if(!plan) return;
  pendingPlan = plan;
  const modal = document.getElementById('pixModal');
  if(!modal) return;
  document.getElementById('pixAmount').textContent = `R$ ${plan.price}`;
  document.getElementById('pixAmountInline').textContent = `R$ ${plan.price}`;
  document.getElementById('pixServiceName').textContent = `Plano ${plan.name} (mensal)`;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function sendPixComprovante(){
  if(pendingPlan){
    const plan = pendingPlan;
    pendingPlan = null;
    const msg = encodeURIComponent(`Ola! Acabei de pagar o Pix referente ao Plano ${plan.name} (R$ ${plan.price}/mes) da Barbearia Monteiro. Segue o comprovante em anexo.`);
    window.open(`https://wa.me/5519994800891?text=${msg}`, '_blank');
    closePixModal();
    openPlanBookingScreen(plan);
    return;
  }
  const price   = state.selectedService ? state.selectedService.price : '?';
  const service = state.selectedService ? state.selectedService.name : 'serviço';
  const profName = state.selectedProf ? (professionals.find(p=>p.id===state.selectedProf)?.name || '') : '';
  const date    = state.selectedDate || '';
  const time    = state.selectedSlot || '';
  const msg = encodeURIComponent(`Ola! Acabei de pagar o Pix referente ao agendamento de ${service}${profName?' com '+profName:''} no dia ${date} as ${time} no valor de R$ ${price}. Segue o comprovante em anexo.`);
  window.open(`https://wa.me/5519994800891?text=${msg}`, '_blank');
  closePixModal();
}

/* ===================== AGENDAMENTO DE PLANO (4 semanas) ===================== */
let planBookingState = { plan:null, comboService:null, profId:null, date:null, slot:null };
let planCalYear  = new Date().getFullYear();
let planCalMonth = new Date().getMonth();

function openPlanBookingScreen(plan){
  const comboService = services.find(s => s.name === plan.comboServiceName);
  if(!comboService){
    toast('Esse plano ainda não está configurado no sistema. Fale com a barbearia pelo WhatsApp pra concluir.');
    return;
  }
  planBookingState = { plan, comboService, profId:null, date:null, slot:null };
  planCalYear  = new Date().getFullYear();
  planCalMonth = new Date().getMonth();

  document.getElementById('planBkTitle').textContent = `Plano ${plan.name}`;
  document.getElementById('planBkSub').textContent = `${comboService.name} · ${comboService.duration} min · 1x por semana, 4 semanas`;
  document.getElementById('planDatesPreview').innerHTML = '';

  renderPlanProfessionals();
  renderPlanCal();
  renderPlanSlots();
  updatePlanConfirmBtn();
  showScreen('screen-plan-booking');
}

function renderPlanProfessionals(){
  const wrap = document.getElementById('planProfRow');
  const eligible = professionals.filter(p => Array.isArray(p.serviceIds) && p.serviceIds.map(Number).includes(Number(planBookingState.comboService.id)));
  if(!eligible.length){
    wrap.innerHTML = `<div class="empty-note">Nenhum colaborador disponível pra esse plano no momento.</div>`;
    return;
  }
  wrap.innerHTML = eligible.map(p => `
    <div class="prof-card ${p.id===planBookingState.profId?'active':''}" onclick="selectPlanProf(${p.id})">
      <div class="prof-avatar" style="background:linear-gradient(135deg, ${p.c1}, ${p.c2});">${p.initials}</div>
      <span>${p.name}</span>
      <small>${p.role}</small>
    </div>
  `).join('');
}
function selectPlanProf(id){
  planBookingState.profId = id;
  planBookingState.slot = null;
  renderPlanProfessionals();
  renderPlanSlots();
  updatePlanConfirmBtn();
}

function planCalPrev(){
  planCalMonth--;
  if(planCalMonth < 0){ planCalMonth = 11; planCalYear--; }
  renderPlanCal();
}
function planCalNext(){
  planCalMonth++;
  if(planCalMonth > 11){ planCalMonth = 0; planCalYear++; }
  renderPlanCal();
}
function renderPlanCal(){
  const label = document.getElementById('planCalMonthLabel');
  const grid  = document.getElementById('planCalGrid');
  if(!label || !grid) return;
  label.textContent = `${monthNames[planCalMonth]} ${planCalYear}`;

  const today   = isoOffset(0);
  const maxDays = Number(businessConfig.bookingWindow) || 30;
  const maxDate = isoOffset(maxDays);

  const firstDay    = new Date(planCalYear, planCalMonth, 1).getDay();
  const daysInMonth = new Date(planCalYear, planCalMonth + 1, 0).getDate();

  let html = '';
  for(let i = firstDay - 1; i >= 0; i--){
    html += `<div class="cal-day other-month"></div>`;
  }
  for(let d = 1; d <= daysInMonth; d++){
    const iso = `${planCalYear}-${String(planCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(iso+'T00:00').getDay();
    const cfg = businessConfig.hours[dow];
    const isClosed   = !cfg || cfg.closed;
    const isBlocked  = isDateBlocked(iso);
    const isPast     = iso < today;
    const isFuture   = iso > maxDate;
    const isWrongDow = dow < 2 || dow > 5; // regra do plano: só Terça(2) a Sexta(5)
    const isSelected = iso === planBookingState.date;
    const isToday    = iso === today;
    const disabled   = isClosed || isBlocked || isPast || isFuture || isWrongDow;
    let cls = 'cal-day';
    if(isSelected) cls += ' selected';
    else if(isToday) cls += ' today';
    if(disabled) cls += ' closed';
    html += `<div class="${cls}" onclick="${disabled?'':`selectPlanDay('${iso}')`}">${d}</div>`;
  }
  const total = firstDay + daysInMonth;
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for(let d = 1; d <= rem; d++){
    html += `<div class="cal-day other-month"></div>`;
  }
  grid.innerHTML = html;
}
function selectPlanDay(iso){
  planBookingState.date = iso;
  planBookingState.slot = null;
  renderPlanCal();
  renderPlanSlots();
  updatePlanConfirmBtn();
  renderPlanDatesPreview();
}

function renderPlanSlots(){
  const wrap = document.getElementById('planSlotWrap');
  if(!planBookingState.profId || !planBookingState.date){
    wrap.innerHTML = `<div class="empty-note">Escolha o profissional e o dia primeiro.</div>`;
    return;
  }
  // generateSlots lê state.selectedService pra saber a duração — troca temporariamente
  // pelo combo do plano (seguro: o fluxo normal de agendamento sempre redefine
  // state.selectedService do zero antes de usar, então não sobra "lixo" aqui).
  const prevService = state.selectedService;
  state.selectedService = planBookingState.comboService;
  const slots = generateSlots(planBookingState.date, planBookingState.profId);
  state.selectedService = prevService;

  if(!slots.length){
    wrap.innerHTML = `<div class="empty-note">Fechado nesse dia. Escolha outro.</div>`;
    return;
  }
  wrap.innerHTML = `<div class="slot-grid">${slots.map(s => `
    <div class="slot ${s.time===planBookingState.slot?'active':''} ${!s.available?'taken':''}"
         onclick="${s.available?`selectPlanSlot('${s.time}')`:''}">${s.time}</div>
  `).join('')}</div>`;
}
function selectPlanSlot(time){
  planBookingState.slot = time;
  renderPlanSlots();
  updatePlanConfirmBtn();
  renderPlanDatesPreview();
}
function renderPlanDatesPreview(){
  const el = document.getElementById('planDatesPreview');
  if(!el) return;
  if(!planBookingState.date || !planBookingState.slot){ el.innerHTML = ''; return; }
  const start = new Date(planBookingState.date+'T00:00');
  const dates = [];
  for(let i = 0; i < 4; i++){
    const d = new Date(start);
    d.setDate(d.getDate() + i*7);
    dates.push(`${weekdayLabel[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  el.innerHTML = `
    <div style="font-size:.72rem; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px;">Suas 4 datas</div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${dates.map((d,i) => `<div style="display:flex; justify-content:space-between; font-size:.85rem; color:var(--cream); background:var(--surface); border:1px solid var(--red-dim); border-radius:10px; padding:9px 12px;"><span>Semana ${i+1}</span><strong>${d} · ${planBookingState.slot}</strong></div>`).join('')}
    </div>
  `;
}
function updatePlanConfirmBtn(){
  document.getElementById('planConfirmBtn').disabled = !planBookingState.profId || !planBookingState.date || !planBookingState.slot;
}

async function confirmPlanBooking(){
  const btn = document.getElementById('planConfirmBtn');
  if(btn.disabled) return;
  btn.disabled = true;
  const { plan, comboService, profId, date, slot } = planBookingState;
  toast('Agendando suas 4 semanas...');
  const res = await apiPost('addPlanBooking', {
    serviceId: comboService.id,
    profId: profId,
    startDate: date,
    time: slot,
    clientName: state.userName || 'Cliente',
    clientPhone: state.userPhone || '',
    payment: `Plano ${plan.name}`,
    planName: plan.name
  });
  if(res.error){
    toast(res.error);
    updatePlanConfirmBtn();
    return;
  }
  (res.dates || []).forEach((d, i) => {
    bookings.push({ id: res.ids[i], serviceId: comboService.id, profId, date: d, time: slot });
    myBookings.push({ id: res.ids[i], serviceId: comboService.id, profId, date: d, time: slot, clientName: state.userName, clientPhone: state.userPhone, payment: `Plano ${plan.name}` });
  });
  toast(`✅ Plano ${plan.name} agendado! 4 semanas confirmadas.`, 4000);
  showScreen('screen-appointments'); setNav('appointments');
  renderAppointments();
}

async function validateClientVisit(phone, serviceName, date, bookingId){
  if(!phone){ toast('Este agendamento não tem telefone cadastrado'); return; }
  if(validatedBookingIds.has(String(bookingId))){ toast('Esta visita já foi validada'); return; }
  toast('Validando visita...');
  const res = await apiPost('validateVisit', { phone, serviceName, date, bookingId });
  if(res.error === 'already_validated'){
    validatedBookingIds.add(String(bookingId));
    renderAgendaApptList();
    toast('Esta visita já foi validada anteriormente');
    return;
  }
  if(res.error){ toast(res.error); return; }
  validatedBookingIds.add(String(bookingId));
  renderAgendaApptList();
  const total = res.total;
  let msg = `✓ Visita validada! ${serviceName} · ${total}/11`;
  if(total === 6)  msg = `⭐ 10% OFF desbloqueado para este cliente!`;
  if(total === 10) msg = `🎉 BRINDE desbloqueado! Cliente tem direito a 1 serviço GRÁTIS!`;
  if(total === 11) msg = `✅ Brinde utilizado! Cartão pode ser zerado agora.`;
  toast(msg, total >= 10 ? 5000 : 3000);
}
async function adminCancelBooking(id){
  const res = await apiPost('cancelBooking', { id, source: 'admin' });
  if(res.error){ toast(res.error); return; }
  bookings = bookings.filter(b=>b.id!==id);
  renderAgendaApptList();
  renderCaixaList();
  toast('Agendamento cancelado');
}

/* ===================== ADMIN ===================== */
function renderAdminDays(){
  const wrap = document.getElementById('adminDays');
  if(!businessConfig.breaks) businessConfig.breaks = {};
  wrap.innerHTML = [1,2,3,4,5,6,0].map(dow => {
    const cfg = businessConfig.hours[dow];
    const brk = businessConfig.breaks[dow] || { active: false, open2: '13:00', close2: '18:00' };
    const isClosed = cfg && cfg.closed;
    return `
      <div class="admin-day">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <strong style="font-size:.95rem;">${weekdayFull[dow]}</strong>
        </div>
        <div class="day-closed-wrap">
          <input type="checkbox" id="closed-${dow}" ${isClosed?'checked':''}
            onchange="toggleDay(${dow}, !this.checked)">
          <label for="closed-${dow}">fechado</label>
        </div>
        <div id="day-body-${dow}" style="opacity:${isClosed?.3:1}; pointer-events:${isClosed?'none':'auto'}; transition:opacity .2s;">
          <div class="day-period-label">HORÁRIO 1 (antes do almoço)</div>
          <div class="admin-times">
            <div class="field">
              <label>Abre às</label>
              <input type="time" value="${toHHmm(cfg?.open||'08:00')}" onchange="updateHour(${dow},'open',this.value)">
            </div>
            <div class="field">
              <label>fecha às</label>
              <input type="time" value="${toHHmm(cfg?.close||'12:00')}" onchange="updateHour(${dow},'close',this.value)">
            </div>
          </div>
          <div class="day-period-label" style="display:flex; justify-content:space-between; align-items:center;">
            <span>HORÁRIO 2 (após o almoço)</span>
            <label class="switch" style="margin-left:8px;">
              <input type="checkbox" ${brk.active?'checked':''} onchange="toggleBreak(${dow}, this.checked)">
              <span class="track"></span>
            </label>
          </div>
          <div id="break-times-${dow}" style="${brk.active?'':'opacity:.3; pointer-events:none;'}">
            <div class="admin-times">
              <div class="field">
                <label>Abre às</label>
                <input type="time" value="${brk.open2||'13:00'}" onchange="updateBreak(${dow},'open2',this.value)">
              </div>
              <div class="field">
                <label>fecha às</label>
                <input type="time" value="${brk.close2||'18:00'}" onchange="updateBreak(${dow},'close2',this.value)">
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
  document.getElementById('adminInterval').value = businessConfig.interval;
  if(document.getElementById('adminBookingWindow'))
    document.getElementById('adminBookingWindow').value = businessConfig.bookingWindow || 30;
  renderBlockedRanges();
}

function renderAdminBreaks(){ /* integrado ao renderAdminDays */ }

function toggleBreak(dow, active){
  if(!businessConfig.breaks) businessConfig.breaks = {};
  if(!businessConfig.breaks[dow]) businessConfig.breaks[dow] = { active: false, open2: '13:00', close2: '18:00' };
  businessConfig.breaks[dow].active = active;
  const el = document.getElementById('break-times-'+dow);
  if(el){ el.style.opacity = active ? '1' : '.3'; el.style.pointerEvents = active ? 'auto' : 'none'; }
}

function updateBreak(dow, field, value){
  if(!businessConfig.breaks) businessConfig.breaks = {};
  if(!businessConfig.breaks[dow]) businessConfig.breaks[dow] = { active: true, open2: '13:00', close2: '18:00' };
  businessConfig.breaks[dow][field] = value;
}
function toggleDay(dow, isOpen){
  businessConfig.hours[dow].closed = !isOpen;
  const body = document.getElementById('day-body-'+dow);
  if(body){ body.style.opacity = isOpen ? '1' : '.3'; body.style.pointerEvents = isOpen ? 'auto' : 'none'; }
}
function updateHour(dow, field, value){
  businessConfig.hours[dow][field] = value;
}
async function saveAdminConfig(){
  businessConfig.interval = Number(document.getElementById('adminInterval').value);
  businessConfig.bookingWindow = Number(document.getElementById('adminBookingWindow').value);
  toast('Salvando...');
  const res = await apiPost('saveConfig', businessConfig);
  if(res.error){ toast(res.error); return; }
  renderHeroHours();
  toast('Configurações salvas!');
}

/* ===================== ADMIN TABS ===================== */
function setAdminTab(tab){
  document.querySelectorAll('#adminTabs .chip').forEach(c => c.classList.toggle('active', c.dataset.tab === tab));
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.getElementById('adminTab-' + tab).style.display = 'block';

  if(tab === 'staff'){ closeStaffForm(); renderStaffList(); }
  if(tab === 'services'){ closeServiceForm(); renderAdminServiceList(); }
  if(tab === 'agenda'){
    if(!selectedAgendaStaff && professionals.length) selectedAgendaStaff = professionals[0].id;
    renderAgendaStaffChips();
    renderAgendaApptList();
  }
  if(tab === 'caixa'){ renderCaixaTab(); }
  if(tab === 'clients'){ renderClientesTab(); }
}

// Chamado ao clicar no nome do cliente num agendamento (na Agenda) — leva pra
// aba Clientes e já abre o cartão fidelidade/histórico daquele cliente.
function goToClientLoyalty(name, phone){
  setAdminTab('clients');
  openLoyaltyModal(name, phone, 0);
}

/* ===================== ADMIN · COLABORADORES ===================== */
function renderStaffList(){
  const wrap = document.getElementById('staffList');
  if(!professionals.length){
    wrap.innerHTML = `<div class="empty-note">Nenhum colaborador cadastrado ainda.</div>`;
    return;
  }
  wrap.innerHTML = professionals.map(p => `
    <div class="service-card">
      <div class="prof-avatar" style="width:46px; height:46px; font-size:.85rem; flex:none; background:linear-gradient(135deg, ${p.c1}, ${p.c2});">${p.initials}</div>
      <div class="service-info">
        <h3>${p.name}</h3>
        <p>${p.role}</p>
        <div class="staff-tags">
          ${p.serviceIds.length ? p.serviceIds.map(id => {
            const s = services.find(x => x.id === id);
            return s ? `<span class="tag-mini">${s.name}</span>` : '';
          }).join('') : '<span class="tag-mini">Nenhum serviço vinculado</span>'}
        </div>
      </div>
      <div class="staff-admin-actions">
        <button class="icon-btn small" onclick="openStaffForm(${p.id})" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
        <button class="icon-btn small danger" onclick="deleteStaff(${p.id})" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}
function staffFormHTML(staff){
  const isEdit = !!staff;
  return `
    <div class="admin-inline-form">
      <h3 style="font-size:.92rem; margin-bottom:14px;">${isEdit ? 'Editar colaborador' : 'Novo colaborador'}</h3>
      <div class="field"><label>Nome</label><input id="staffFormName" type="text" value="${isEdit ? staff.name : ''}" placeholder="Nome completo"></div>
      <div class="field"><label>Função</label><input id="staffFormRole" type="text" value="${isEdit ? staff.role : ''}" placeholder="Ex: Barbeiro, Manicure, Esteticista"></div>
      <div class="field" style="margin-bottom:4px;">
        <label>Serviços que realiza</label>
        <div class="service-check-list">
          ${services.map(s => `
            <label class="check-row">
              <input type="checkbox" value="${s.id}" ${isEdit && staff.serviceIds.includes(s.id) ? 'checked' : ''}>
              <span>${s.name} <span style="color:var(--muted-2);">· ${s.cat}</span></span>
            </label>
          `).join('') || '<p style="color:var(--muted); font-size:.8rem;">Cadastre serviços primeiro na aba Serviços.</p>'}
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-top:18px;">
        <button class="btn btn-gold" style="flex:1;" onclick="saveStaff()">Salvar</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="closeStaffForm()">Cancelar</button>
      </div>
    </div>
  `;
}
function openStaffForm(id){
  editingStaffId = id;
  const staff = id ? professionals.find(p => p.id === id) : null;
  const wrap = document.getElementById('staffFormWrap');
  wrap.style.display = 'block';
  wrap.innerHTML = staffFormHTML(staff);
  wrap.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function closeStaffForm(){
  editingStaffId = null;
  const wrap = document.getElementById('staffFormWrap');
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}
async function saveStaff(){
  const name = document.getElementById('staffFormName').value.trim();
  const role = document.getElementById('staffFormRole').value.trim();
  const serviceIds = Array.from(document.querySelectorAll('#staffFormWrap input[type=checkbox]:checked')).map(c => Number(c.value));
  if(!name){ toast('Digite o nome do colaborador'); return; }

  toast('Salvando...');
  if(editingStaffId){
    const staff = professionals.find(p => p.id === editingStaffId);
    const updated = {
      id: editingStaffId, name, role: role || staff.role, serviceIds,
      initials: name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase(),
      c1: staff.c1, c2: staff.c2
    };
    const res = await apiPost('saveStaff', updated);
    if(res.error){ toast(res.error); return; }
    Object.assign(staff, updated);
  } else {
    const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
    const colors = avatarPalette[professionals.length % avatarPalette.length];
    const newStaff = {name, role: role || 'Profissional', initials, c1:colors[0], c2:colors[1], serviceIds};
    const res = await apiPost('saveStaff', newStaff);
    if(res.error){ toast(res.error); return; }
    professionals.push({id: res.id, ...newStaff});
  }
  closeStaffForm();
  renderStaffList();
  toast('Colaborador salvo com sucesso!');
}
async function deleteStaff(id){
  toast('Removendo...');
  const res = await apiPost('deleteStaff', { id });
  if(res.error){ toast(res.error); return; }
  professionals = professionals.filter(p => p.id !== id);
  // Não remove de `bookings`: a exclusão no backend só marca o colaborador como
  // inativo (não cancela os agendamentos dele) — removê-los daqui faria
  // agendamentos ainda válidos sumirem da Agenda/Caixa até a próxima recarga.
  if(selectedAgendaStaff === id) selectedAgendaStaff = null;
  renderStaffList();
  toast('Colaborador removido');
}

/* ===================== ADMIN · SERVIÇOS ===================== */
function renderAdminServiceList(){
  const wrap = document.getElementById('adminServiceList');
  if(!services.length){
    wrap.innerHTML = `<div class="empty-note">Nenhum serviço cadastrado ainda.</div>`;
    return;
  }
  wrap.innerHTML = services.map(s => `
    <div class="service-card">
      <div class="service-bar"></div>
      <div class="service-info">
        <h3>${s.name}</h3>
        <p>${s.cat} · ${s.duration} min</p>
      </div>
      <div class="service-price"><strong>R$ ${s.price}</strong></div>
      <div class="staff-admin-actions">
        <button class="icon-btn small" onclick="openServiceForm(${s.id})" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
        <button class="icon-btn small danger" onclick="deleteService(${s.id})" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}
function serviceFormHTML(s){
  const isEdit = !!s;
  const hasImg = isEdit && s.imageUrl;
  return `
    <div class="admin-inline-form">
      <h3 style="font-size:.92rem; margin-bottom:14px;">${isEdit ? 'Editar serviço' : 'Novo serviço'}</h3>
      <div class="field"><label>Nome do serviço</label><input id="svcFormName" type="text" value="${isEdit ? s.name : ''}" placeholder="Ex: Corte Degradê"></div>
      <div class="field">
        <label>Categoria</label>
        <select id="svcFormCat">
          ${masterCategories.map(c => `<option value="${c}" ${isEdit && s.cat === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="admin-times">
        <div class="field"><label>Duração (min)</label><input id="svcFormDuration" type="number" min="5" step="5" value="${isEdit ? s.duration : 30}"></div>
        <div class="field"><label>Preço (R$)</label><input id="svcFormPrice" type="number" min="0" step="5" value="${isEdit ? s.price : 0}"></div>
      </div>
      <div class="field">
        <label>Foto do serviço (opcional)</label>
        <div class="img-upload-wrap">
          <div class="img-preview-box" onclick="document.getElementById('svcImgInput').click()" id="svcImgPreviewBox">
            ${hasImg
              ? `<img id="svcImgPreview" src="${s.imageUrl}" alt="preview">
                 <button class="img-remove" onclick="event.stopPropagation(); removeSvcImage()" title="Remover foto">✕</button>`
              : `<div class="img-placeholder">📷<br>Toque para escolher uma foto</div>`
            }
          </div>
          <input type="file" id="svcImgInput" accept="image/*" style="display:none" onchange="handleSvcImageUpload(this)">
          <button class="img-upload-btn" onclick="document.getElementById('svcImgInput').click()">
            ${hasImg ? '🔄 Trocar foto' : '📁 Escolher foto da galeria'}
          </button>
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-top:18px;">
        <button class="btn btn-gold" style="flex:1;" onclick="saveService()">Salvar</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="closeServiceForm()">Cancelar</button>
      </div>
    </div>
  `;
}
function openServiceForm(id){
  editingServiceId = id;
  svcImageData = null; // limpa imagem pendente ao abrir o form
  const s = id ? services.find(x => x.id === id) : null;
  if(s) svcImageData = s.imageUrl || null; // carrega imagem existente
  const wrap = document.getElementById('serviceFormWrap');
  wrap.style.display = 'block';
  wrap.innerHTML = serviceFormHTML(s);
  wrap.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function closeServiceForm(){
  editingServiceId = null;
  svcImageData = null;
  const wrap = document.getElementById('serviceFormWrap');
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}

// Variável que guarda a imagem atual do formulário de serviço (base64 ou filename)
let svcImageData = null;

function handleSvcImageUpload(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      // Comprime e redimensiona para caber no Google Sheets (max 50k chars por célula)
      const MAX = 400;
      let w = img.width, h = img.height;
      if(w > h){ if(w > MAX){ h = Math.round(h * MAX / w); w = MAX; } }
      else      { if(h > MAX){ w = Math.round(w * MAX / h); h = MAX; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      svcImageData = dataUrl;
      // Atualiza o preview no formulário
      const box = document.getElementById('svcImgPreviewBox');
      if(box){
        box.innerHTML = `
          <img id="svcImgPreview" src="${dataUrl}" alt="preview">
          <button class="img-remove" onclick="event.stopPropagation(); removeSvcImage()" title="Remover foto">✕</button>
        `;
      }
      const btn = input.parentElement && input.parentElement.querySelector('.img-upload-btn');
      if(btn) btn.textContent = '🔄 Trocar foto';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeSvcImage(){
  svcImageData = null;
  const box = document.getElementById('svcImgPreviewBox');
  if(box) box.innerHTML = `<div class="img-placeholder">📷<br>Toque para escolher uma foto</div>`;
  const btn = document.querySelector('.img-upload-btn');
  if(btn) btn.textContent = '📁 Escolher foto da galeria';
  const input = document.getElementById('svcImgInput');
  if(input) input.value = '';
}
async function saveService(){
  const name = document.getElementById('svcFormName').value.trim();
  const cat = document.getElementById('svcFormCat').value;
  const duration = Number(document.getElementById('svcFormDuration').value);
  const price = Number(document.getElementById('svcFormPrice').value);
  const imageUrl = svcImageData || '';
  if(!name){ toast('Digite o nome do serviço'); return; }
  if(!duration || duration <= 0){ toast('Informe uma duração válida'); return; }
  if(price < 0){ toast('Informe um preço válido'); return; }

  toast('Salvando...');
  if(editingServiceId){
    const payload = { id: editingServiceId, name, cat, duration, price, imageUrl };
    const res = await apiPost('saveService', payload);
    if(res.error){ toast(res.error); return; }
    const s = services.find(x => x.id === editingServiceId);
    Object.assign(s, payload);
  } else {
    const payload = { cat, name, duration, price, imageUrl };
    const res = await apiPost('saveService', payload);
    if(res.error){ toast(res.error); return; }
    services.push({id: res.id, ...payload});
  }
  closeServiceForm();
  renderAdminServiceList();
  renderCategoryChips();
  renderServices();
  toast('Serviço salvo com sucesso!');
}
async function deleteService(id){
  toast('Removendo...');
  const res = await apiPost('deleteService', { id });
  if(res.error){ toast(res.error); return; }
  services = services.filter(s => s.id !== id);
  professionals.forEach(p => { p.serviceIds = p.serviceIds.filter(sid => sid !== id); });
  // Não remove de `bookings`: a exclusão no backend só marca o serviço como
  // inativo (não cancela os agendamentos dele) — removê-los daqui faria
  // agendamentos ainda válidos sumirem da Agenda/Caixa até a próxima recarga.
  renderAdminServiceList();
  renderCategoryChips();
  renderServices();
  toast('Serviço removido');
}

/* ===================== ADMIN · AGENDA POR COLABORADOR ===================== */
let agendaCalYear  = new Date().getFullYear();
let agendaCalMonth = new Date().getMonth();
let agendaSelectedDate = isoOffset(0);
const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function renderAgendaStaffChips(){
  const wrap = document.getElementById('agendaStaffChips');
  if(!professionals.length){ wrap.innerHTML = ''; document.getElementById('agendaApptList').innerHTML = `<div class="empty-note">Cadastre um colaborador.</div>`; return; }
  wrap.innerHTML = professionals.map(p => `<div class="chip ${p.id === selectedAgendaStaff ? 'active' : ''}" onclick="selectAgendaStaff(${p.id})">${p.name}</div>`).join('');
}
function selectAgendaStaff(id){ selectedAgendaStaff = id; renderAgendaStaffChips(); renderAgendaCal(); renderAgendaApptList(); }
function agendaCalPrev(){ agendaCalMonth--; if(agendaCalMonth<0){agendaCalMonth=11;agendaCalYear--;} renderAgendaCal(); }
function agendaCalNext(){ agendaCalMonth++; if(agendaCalMonth>11){agendaCalMonth=0;agendaCalYear++;} renderAgendaCal(); }
function agendaCalToday(){ const now=new Date(); agendaCalYear=now.getFullYear(); agendaCalMonth=now.getMonth(); agendaSelectedDate=isoOffset(0); renderAgendaCal(); renderAgendaApptList(); }
function agendaCalSelectDay(iso){ agendaSelectedDate=iso; renderAgendaCal(); renderAgendaApptList(); openDaySlots(iso); }
function clearAgendaFilters(){ agendaCalToday(); }
function renderAgendaCal(){
  const label=document.getElementById('calMonthLabel'); if(label) label.textContent=`${monthNames[agendaCalMonth]} ${agendaCalYear}`;
  const grid=document.getElementById('calGrid'); if(!grid) return;
  const today=isoOffset(0);
  const bookedDays=new Set(bookings.filter(b=>!selectedAgendaStaff||b.profId===selectedAgendaStaff).map(b=>String(b.date).slice(0,10)));
  const firstDay=new Date(agendaCalYear,agendaCalMonth,1).getDay();
  const daysInMonth=new Date(agendaCalYear,agendaCalMonth+1,0).getDate();
  const daysInPrev=new Date(agendaCalYear,agendaCalMonth,0).getDate();
  let html='';
  for(let i=firstDay-1;i>=0;i--){ const d=daysInPrev-i; const m=agendaCalMonth===0?11:agendaCalMonth-1; const y=agendaCalMonth===0?agendaCalYear-1:agendaCalYear; const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; html+=`<div class="cal-day other-month" onclick="agendaCalSelectDay('${iso}')">${d}</div>`; }
  for(let d=1;d<=daysInMonth;d++){ const iso=`${agendaCalYear}-${String(agendaCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const isToday=iso===today; const isSel=iso===agendaSelectedDate; const hasBk=bookedDays.has(iso); const dow=new Date(iso+'T00:00').getDay(); const cfg=businessConfig.hours[dow]; const closed=cfg&&cfg.closed; let cls='cal-day'; if(isSel) cls+=' selected'; else if(isToday) cls+=' today'; if(hasBk&&!isSel) cls+=' has-booking'; if(closed) cls+=' closed'; html+=`<div class="${cls}" onclick="agendaCalSelectDay('${iso}')">${d}</div>`; }
  const total=firstDay+daysInMonth; const remaining=total%7===0?0:7-(total%7);
  for(let d=1;d<=remaining;d++){ const m=agendaCalMonth===11?0:agendaCalMonth+1; const y=agendaCalMonth===11?agendaCalYear+1:agendaCalYear; const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; html+=`<div class="cal-day other-month" onclick="agendaCalSelectDay('${iso}')">${d}</div>`; }
  grid.innerHTML=html;
  const dateLabel=document.getElementById('agendaDateLabel'); if(dateLabel&&agendaSelectedDate){ const ds=new Date(agendaSelectedDate+'T00:00'); dateLabel.textContent=`${weekdayFull[ds.getDay()]}, ${String(ds.getDate()).padStart(2,'0')} de ${monthNames[ds.getMonth()]}`; }
}


function renderAgendaApptList(){
  const wrap = document.getElementById('agendaApptList');
  if(!wrap) return;
  renderAgendaCal();
  if(!selectedAgendaStaff){ wrap.innerHTML = `<div class="empty-note">Selecione um colaborador acima.</div>`; return; }
  let list = bookings.filter(b => b.profId === selectedAgendaStaff && String(b.date).slice(0,10) === agendaSelectedDate);
  list.sort((a,b) => String(a.time).localeCompare(String(b.time)));
  const dateLabel = document.getElementById('agendaDateLabel');
  if(dateLabel && agendaSelectedDate){ const ds = new Date(agendaSelectedDate+'T00:00'); dateLabel.textContent = `${weekdayFull[ds.getDay()]}, ${String(ds.getDate()).padStart(2,'0')} de ${monthNames[ds.getMonth()]}`; }
  if(!list.length){ wrap.innerHTML = `<div class="empty-note">Sem agendamentos neste dia.</div>`; return; }
  wrap.innerHTML = list.map(b => {
    const s = services.find(x => x.id === b.serviceId);
    let timeStr = toHHmm(b.time);
    const d = agendaSelectedDate ? new Date(agendaSelectedDate+'T00:00') : null;
    const dayLabel = d ? weekdayLabel[d.getDay()] : '—';
    const dayNum = d ? String(d.getDate()).padStart(2,'0') : '—';
    const phone = String(b.clientPhone || '').replace(/\D/g,'');
    const waMsg = encodeURIComponent(`Ola ${b.clientName || 'cliente'}! Este e um lembrete da Barbearia Monteiro. Voce tem um agendamento de ${s ? s.name : 'servico'} marcado para ${dayLabel}, dia ${dayNum}, as ${timeStr}. Aguardamos voce!`);
    const waLink = phone ? `https://wa.me/55${phone}?text=${waMsg}` : '';
    const payLabel = b.payment || '';
    const phoneFormatted = formatPhoneBR(phone);
    const clientNameSafe = escapeForJsAttr(b.clientName || 'Cliente');
    return `
      <div class="appt-card">
        <div class="appt-card-top">
          <div class="appt-date"><span>${dayLabel}</span><strong>${dayNum}</strong></div>
          <div class="appt-info">
            <h3 ${phone ? `onclick="goToClientLoyalty('${clientNameSafe}','${phone}')" style="cursor:pointer; text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px;"` : ''}>${escapeHtml(b.clientName || 'Cliente')}</h3>
            ${phoneFormatted ? `<a href="tel:+55${phone}" class="appt-phone">${phoneFormatted}</a>` : ''}
            <p>${s ? s.name : 'Servico'} · ${timeStr}</p>
            ${payLabel ? `<p style="color:var(--green-bright); font-size:.8rem; margin-top:2px;">💳 ${payLabel}</p>` : ''}
          </div>
        </div>
        <div class="appt-card-bottom">
          <div class="appt-status">Confirmado</div>
          <strong class="appt-value">R$ ${s ? s.price : 0}</strong>
          <div style="display:flex; gap:8px; align-items:center;">
            ${validatedBookingIds.has(String(b.id))
              ? `<span style="font-size:.68rem; color:var(--green-bright); background:rgba(63,174,102,.12); border:1px solid rgba(63,174,102,.3); border-radius:999px; padding:4px 8px; white-space:nowrap;">✓ Validada</span>`
              : `<button class="icon-btn small" onclick="event.stopPropagation(); validateClientVisit('${String(b.clientPhone||'').replace(/\D/g,'')}','${s?s.name:'Atendimento'}','${agendaSelectedDate}','${b.id}')" title="Validar visita no cartão fidelidade" style="color:var(--green-bright);">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                </button>`
            }
            ${waLink ? `<button class="icon-btn small" onclick="event.stopPropagation(); openWhatsApp('${waLink}')" title="Enviar lembrete" style="color:#25D366;"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.528 5.845L0 24l6.335-1.505A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.652-.513-5.168-1.407l-.371-.22-3.762.894.952-3.653-.242-.386A9.94 9.94 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg></button>` : ''}
            <button class="icon-btn small danger" onclick="adminCancelBooking(${b.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
          </div>
        </div>
      </div>`;
  }).join('');
}


/* ===================== MODAL · HORÁRIOS DO DIA ===================== */
let daySlotsDate = null;
let daySlotsNewSlot = null;

function openDaySlots(iso){
  if(!selectedAgendaStaff) return;
  daySlotsDate = iso;
  daySlotsNewSlot = null;

  const prof = professionals.find(p => p.id === selectedAgendaStaff);
  const ds = new Date(iso+'T00:00');
  const dateLabel = `${weekdayFull[ds.getDay()]}, ${String(ds.getDate()).padStart(2,'0')} de ${monthNames[ds.getMonth()]}`;

  document.getElementById('daySlotsTitle').textContent = dateLabel;
  document.getElementById('daySlotsSubtitle').textContent = prof ? prof.name : '';
  document.getElementById('daySlotsOverlay').classList.add('show');
  renderDaySlotsBody();
}

function closeDaySlotsModal(){
  document.getElementById('daySlotsOverlay').classList.remove('show');
  daySlotsDate = null;
  daySlotsNewSlot = null;
}

function closeDaySlots(e){
  if(e.target === document.getElementById('daySlotsOverlay')) closeDaySlotsModal();
}

function renderDaySlotsBody(){
  const wrap = document.getElementById('daySlotsBody');
  if(!wrap || !daySlotsDate || !selectedAgendaStaff){ return; }

  const slots = generateSlots(daySlotsDate, selectedAgendaStaff);
  if(!slots.length){
    wrap.innerHTML = `<div class="empty-note">Sem horários disponíveis neste dia (fechado ou bloqueado).</div>
      <button class="btn btn-ghost" style="margin-top:12px;" onclick="closeDaySlotsModal()">Fechar</button>`;
    return;
  }

  const dayBookings = bookings.filter(b => b.profId === selectedAgendaStaff && String(b.date).slice(0,10) === daySlotsDate);

  let html = '';
  slots.forEach(slot => {
    const booking = dayBookings.find(b => toHHmm(b.time) === slot.time);
    if(booking){
      const s = services.find(x => x.id === booking.serviceId);
      html += `
        <div class="day-slot-row slot-taken">
          <div class="day-slot-time">${slot.time}</div>
          <div class="day-slot-info">
            <strong>${booking.clientName || 'Cliente'}</strong>
            <span>${s ? s.name : 'Serviço'}</span>
          </div>
          <span class="day-slot-badge badge-taken">Ocupado</span>
        </div>`;
    } else if(slot.available){
      html += `
        <div class="day-slot-row slot-free" onclick="selectDaySlotForBooking('${slot.time}')">
          <div class="day-slot-time">${slot.time}</div>
          <div class="day-slot-info">
            <strong>Horário livre</strong>
            <span>Clique para agendar</span>
          </div>
          <span class="day-slot-badge badge-free">Livre</span>
        </div>`;
    } else {
      // passado ou pausa
      html += `
        <div class="day-slot-row slot-taken" style="opacity:.4;">
          <div class="day-slot-time">${slot.time}</div>
          <div class="day-slot-info"><strong style="color:var(--muted);">Indisponível</strong></div>
        </div>`;
    }
  });

  html += `<div id="daySlotsFormArea"></div><div style="height:16px;"></div>`;
  wrap.innerHTML = html;
}

function selectDaySlotForBooking(time){
  daySlotsNewSlot = time;
  // Remove destaque anterior
  document.querySelectorAll('.day-slot-row.slot-free').forEach(el => el.style.borderColor = '');
  // Destaca o selecionado
  const rows = document.querySelectorAll('.day-slot-row.slot-free');
  rows.forEach(el => {
    if(el.querySelector('.day-slot-time') && el.querySelector('.day-slot-time').textContent.trim() === time){
      el.style.borderColor = 'var(--red-bright)';
    }
  });
  renderDaySlotsForm(time);
}

function renderDaySlotsForm(time){
  const area = document.getElementById('daySlotsFormArea');
  if(!area) return;
  area.innerHTML = `
    <div class="day-slots-new-form">
      <h4>Agendar às ${time}</h4>
      <div class="field"><label>Nome do cliente</label><input id="dsName" type="text" placeholder="Nome completo"></div>
      <div class="field"><label>Telefone (opcional)</label><input id="dsPhone" type="tel" placeholder="(11) 99999-9999" oninput="maskPhone(this)"></div>
      <div class="field">
        <label>Serviço</label>
        <select id="dsService">
          ${services.map(s => `<option value="${s.id}">${s.name} — R$ ${s.price}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Pagamento</label>
        <select id="dsPayment">
          <option value="Pix">Pix</option>
          <option value="Crédito">Cartão Crédito</option>
          <option value="Débito">Cartão Débito</option>
          <option value="Dinheiro">Dinheiro</option>
        </select>
      </div>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button class="btn btn-green" style="flex:1;" onclick="saveDaySlotBooking('${time}', this)">Agendar</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="cancelDaySlotsForm()">Cancelar</button>
      </div>
    </div>`;
  area.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function cancelDaySlotsForm(){
  daySlotsNewSlot = null;
  const area = document.getElementById('daySlotsFormArea');
  if(area) area.innerHTML = '';
  document.querySelectorAll('.day-slot-row.slot-free').forEach(el => el.style.borderColor = '');
}

async function saveDaySlotBooking(time, btnEl){
  const name      = (document.getElementById('dsName')?.value || '').trim();
  const phone     = (document.getElementById('dsPhone')?.value || '').replace(/\D/g,'');
  const serviceId = Number(document.getElementById('dsService')?.value);
  const payment   = document.getElementById('dsPayment')?.value || 'Pix';

  if(!name){ toast('Digite o nome do cliente'); return; }
  if(!daySlotsDate){ toast('Erro: data não definida'); return; }
  if(btnEl?.disabled) return; // evita duplo-clique disparar duas reservas
  if(btnEl) btnEl.disabled = true;

  toast('Gravando...');
  const res = await apiPost('addBooking', {
    serviceId, profId: selectedAgendaStaff,
    date: daySlotsDate, time,
    clientName: name, clientPhone: phone, payment,
    source: 'admin'
  });
  if(res.error){ toast(res.error); if(btnEl) btnEl.disabled = false; return; }

  bookings.push({
    id: res.id, serviceId, profId: selectedAgendaStaff,
    date: daySlotsDate, time, clientName: name, clientPhone: phone, payment
  });

  toast(`✅ ${name} agendado às ${time}!`);
  renderDaySlotsBody();

  // Atualiza o calendário e lista por baixo
  const d = new Date(daySlotsDate+'T00:00');
  agendaCalYear  = d.getFullYear();
  agendaCalMonth = d.getMonth();
  agendaSelectedDate = daySlotsDate;
  renderAgendaApptList();
}

/* ===================== BLOQUEIO DE AGENDA ===================== */
function renderBlockedRanges(){
  const wrap = document.getElementById('blockedRangesList');
  if(!wrap) return;
  const ranges = businessConfig.blockedRanges || [];
  if(!ranges.length){ wrap.innerHTML = ''; }
  else {
    wrap.innerHTML = ranges.map((r,i) => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface); border:1px solid rgba(196,60,45,.2); border-radius:8px; padding:10px 14px; margin-top:8px;">
        <span style="font-size:.85rem; color:var(--cream);">${r.from} → ${r.to}</span>
        <button class="icon-btn small danger" onclick="removeBlockedRange(${i})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');
  }
  // Renderiza bloqueios de horário
  const slotsWrap = document.getElementById('blockedSlotsList');
  if(!slotsWrap) return;
  const slots = businessConfig.blockedSlots || [];
  if(!slots.length){ slotsWrap.innerHTML = ''; return; }
  slotsWrap.innerHTML = slots.map((s,i) => `
    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface); border:1px solid rgba(196,60,45,.2); border-radius:8px; padding:10px 14px; margin-top:8px;">
      <span style="font-size:.85rem; color:var(--cream);">📅 ${s.date} · ${s.from} → ${s.to}</span>
      <button class="icon-btn small danger" onclick="removeBlockedSlot(${i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('');
}

function addBlockedSlot(){
  const date = document.getElementById('blockSlotDate').value;
  const from = document.getElementById('blockSlotFrom').value;
  const to   = document.getElementById('blockSlotTo').value;
  if(!date){ toast('Selecione o dia'); return; }
  if(!from || !to){ toast('Selecione os horários de início e fim'); return; }
  if(from >= to){ toast('O horário de início deve ser antes do fim'); return; }
  if(!businessConfig.blockedSlots) businessConfig.blockedSlots = [];
  businessConfig.blockedSlots.push({ date, from, to });
  document.getElementById('blockSlotDate').value = '';
  document.getElementById('blockSlotFrom').value = '12:00';
  document.getElementById('blockSlotTo').value   = '14:00';
  renderBlockedRanges();
  toast('Horário bloqueado — clique em Salvar para confirmar');
}

function removeBlockedSlot(i){
  businessConfig.blockedSlots.splice(i, 1);
  renderBlockedRanges();
  toast('Bloqueio removido — clique em Salvar para confirmar');
}
function addBlockedRange(){
  const from = document.getElementById('blockFrom').value;
  const to   = document.getElementById('blockTo').value;
  if(!from || !to){ toast('Selecione as datas de início e fim'); return; }
  if(from > to){ toast('A data de início deve ser antes do fim'); return; }
  // Limite: máximo 1 ano à frente
  const maxDate = isoOffset(365);
  if(to > maxDate){ toast('O bloqueio não pode ultrapassar 1 ano'); return; }
  if(!businessConfig.blockedRanges) businessConfig.blockedRanges = [];
  businessConfig.blockedRanges.push({from, to});
  document.getElementById('blockFrom').value = '';
  document.getElementById('blockTo').value = '';
  renderBlockedRanges();
  toast('Bloqueio adicionado — clique em Salvar para confirmar');
}
function removeBlockedRange(i){
  businessConfig.blockedRanges.splice(i, 1);
  renderBlockedRanges();
  toast('Bloqueio removido — clique em Salvar para confirmar');
}

/* ===================== AGENDAMENTO PELO ADMIN ===================== */
function openAdminBookingForm(){
  const wrap = document.getElementById('adminBookingFormWrap');
  wrap.style.display = 'block';
  const today = isoOffset(0);
  wrap.innerHTML = `
    <div class="admin-inline-form" style="margin:0;">
      <h3 style="font-size:.92rem; margin-bottom:14px;">Novo agendamento</h3>
      <div class="field"><label>Nome do cliente</label><input id="abfName" type="text" placeholder="Nome completo"></div>
      <div class="field"><label>Telefone (opcional)</label><input id="abfPhone" type="tel" placeholder="(11) 99999-9999" oninput="maskPhone(this)"></div>
      <div class="field">
        <label>Colaborador</label>
        <select id="abfProf" onchange="renderAdminBookingSlots()">
          ${professionals.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Data</label><input id="abfDate" type="date" value="${today}" onchange="renderAdminBookingSlots()"></div>
      <div class="field"><label>Serviço</label>
        <select id="abfService">
          ${services.map(s => `<option value="${s.id}">${s.name} — R$ ${s.price}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Horário disponível</label>
        <div id="abfSlots" style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:6px;"></div>
      </div>
      <div class="field"><label>Pagamento</label>
        <select id="abfPayment">
          <option value="Pix">Pix</option>
          <option value="Crédito">Cartão Crédito</option>
          <option value="Débito">Cartão Débito</option>
          <option value="Dinheiro">Dinheiro</option>
        </select>
      </div>

      <!-- BLOCO DE RECORRÊNCIA -->
      <div style="margin-top:18px; padding:14px 16px; background:rgba(196,60,45,.06); border:1px solid rgba(196,60,45,.2); border-radius:var(--radius-sm);">
        <div class="day-closed-wrap" style="margin-bottom:0;">
          <input type="checkbox" id="abfRepeat" onchange="toggleRepeatBlock(this.checked)">
          <label for="abfRepeat" style="font-size:.88rem; color:var(--cream); font-weight:500;">Repetir este agendamento...</label>
        </div>
        <div id="abfRepeatBlock" style="display:none; margin-top:14px;">
          <div class="admin-times" style="margin-bottom:10px;">
            <div class="field">
              <label>A cada</label>
              <input id="abfEveryDays" type="number" min="1" max="365" value="7" style="width:100%;">
            </div>
            <div class="field">
              <label>&nbsp;</label>
              <select id="abfEveryUnit">
                <option value="days">dias</option>
                <option value="weeks" selected>semanas</option>
                <option value="months">meses</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Pelo período de</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <input id="abfForMonths" type="number" min="1" max="12" value="3" style="width:80px;">
              <span style="color:var(--muted); font-size:.85rem;">meses</span>
            </div>
          </div>
          <div id="abfRepeatPreview" style="font-size:.78rem; color:var(--muted); margin-top:8px; line-height:1.6;"></div>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn btn-green" style="flex:1;" onclick="saveAdminBooking(this)">Gravar agendamento</button>
        <button class="btn btn-ghost" style="flex:1;" onclick="closeAdminBookingForm()">Cancelar</button>
      </div>
    </div>
  `;
  renderAdminBookingSlots();
  wrap.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function toggleRepeatBlock(active){
  const block = document.getElementById('abfRepeatBlock');
  if(block) block.style.display = active ? 'block' : 'none';
  if(active) updateRepeatPreview();
}

function getRepeatDates(startDate){
  const every = Number(document.getElementById('abfEveryDays')?.value) || 7;
  const unit  = document.getElementById('abfEveryUnit')?.value || 'weeks';
  const months = Number(document.getElementById('abfForMonths')?.value) || 3;

  // Calcula intervalo em dias
  let intervalDays;
  if(unit === 'days')   intervalDays = every;
  else if(unit === 'weeks') intervalDays = every * 7;
  else intervalDays = every * 30; // meses aproximado

  // Data limite
  const start = new Date(startDate + 'T00:00');
  const end   = new Date(start);
  end.setMonth(end.getMonth() + months);

  const dates = [];
  const cur = new Date(start);
  cur.setDate(cur.getDate() + intervalDays); // começa na próxima data
  while(cur <= end){
    const y  = cur.getFullYear();
    const m  = String(cur.getMonth()+1).padStart(2,'0');
    const d  = String(cur.getDate()).padStart(2,'0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + intervalDays);
  }
  return dates;
}

function updateRepeatPreview(){
  const date  = document.getElementById('abfDate')?.value;
  const preview = document.getElementById('abfRepeatPreview');
  if(!date || !preview) return;
  const dates = getRepeatDates(date);
  const warnings = [];
  const validDates = [];
  dates.forEach(iso => {
    const dow = new Date(iso+'T00:00').getDay();
    const cfg = businessConfig.hours[dow];
    if(!cfg || cfg.closed){
      warnings.push(`⚠️ ${iso} (${weekdayFull[dow]}) — dia fechado`);
    } else {
      validDates.push(iso);
    }
  });
  let html = `<strong style="color:var(--cream);">${dates.length} repetição${dates.length!==1?'ões':''} gerada${dates.length!==1?'s':''}:</strong><br>`;
  html += validDates.map(d => `✓ ${d}`).join('<br>');
  if(warnings.length) html += `<br><br><span style="color:#f0c040;">${warnings.join('<br>')}</span>`;
  preview.innerHTML = html;
}

let adminSelectedSlot = null;
function renderAdminBookingSlots(){
  const profId = Number(document.getElementById('abfProf')?.value);
  const date   = document.getElementById('abfDate')?.value;
  const wrap   = document.getElementById('abfSlots');
  if(!wrap) return;
  adminSelectedSlot = null;
  const slots = generateSlots(date, profId);
  if(!slots.length){ wrap.innerHTML = `<div style="color:var(--muted); font-size:.8rem; grid-column:1/-1;">Nenhum slot disponível neste dia.</div>`; return; }
  wrap.innerHTML = slots.map(s => `
    <div class="slot ${s.available?'':'taken'}" id="abf-slot-${s.time.replace(':','-')}"
         onclick="${s.available?`selectAdminSlot('${s.time}')`:''}">
      ${s.time}
    </div>
  `).join('');
  // Atualiza preview de recorrência quando a data muda
  if(document.getElementById('abfRepeat')?.checked) updateRepeatPreview();
}
function selectAdminSlot(time){
  adminSelectedSlot = time;
  document.querySelectorAll('#abfSlots .slot').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('abf-slot-'+time.replace(':','-'));
  if(el) el.classList.add('selected');
}
function closeAdminBookingForm(){
  const wrap = document.getElementById('adminBookingFormWrap');
  wrap.style.display = 'none';
  wrap.innerHTML = '';
  adminSelectedSlot = null;
}
async function saveAdminBooking(btnEl){
  const name      = document.getElementById('abfName').value.trim();
  const phone     = document.getElementById('abfPhone').value.replace(/\D/g,'');
  const profId    = Number(document.getElementById('abfProf').value);
  const date      = document.getElementById('abfDate').value;
  const serviceId = Number(document.getElementById('abfService').value);
  const payment   = document.getElementById('abfPayment').value;
  const repeat    = document.getElementById('abfRepeat')?.checked;

  if(!name){ toast('Digite o nome do cliente'); return; }
  if(!date){ toast('Selecione a data'); return; }
  if(!adminSelectedSlot){ toast('Selecione um horário'); return; }
  if(btnEl?.disabled) return; // evita duplo-clique disparar duas reservas
  if(btnEl) btnEl.disabled = true;

  // Monta lista de datas: sempre inclui a data principal
  const allDates = [date];
  if(repeat){
    const extras = getRepeatDates(date);
    // Filtra dias fechados e avisa
    const closed = [];
    extras.forEach(iso => {
      const dow = new Date(iso+'T00:00').getDay();
      const cfg = businessConfig.hours[dow];
      if(!cfg || cfg.closed) closed.push(iso);
      else allDates.push(iso);
    });
    if(closed.length){
      toast(`⚠️ ${closed.length} data(s) em dia fechado serão ignoradas`);
      await new Promise(r => setTimeout(r, 1800));
    }
  }

  toast(`Gravando ${allDates.length} agendamento${allDates.length>1?'s':''}...`);

  let criados = 0;
  let erros = 0;
  for(const d of allDates){
    const res = await apiPost('addBooking', {
      serviceId, profId, date: d, time: adminSelectedSlot,
      clientName: name, clientPhone: phone, payment,
      source: 'admin'
    });
    if(res.error){ erros++; }
    else {
      bookings.push({ id: res.id, serviceId, profId, date: d, time: adminSelectedSlot, clientName: name, clientPhone: phone, payment });
      criados++;
    }
  }

  closeAdminBookingForm();
  const d = new Date(date+'T00:00');
  agendaCalYear  = d.getFullYear();
  agendaCalMonth = d.getMonth();
  agendaSelectedDate = date;
  selectedAgendaStaff = profId;
  renderAgendaStaffChips();
  renderAgendaApptList();

  let msg = `✓ ${criados} agendamento${criados>1?'s':''} criado${criados>1?'s':''}!`;
  if(erros) msg += ` (${erros} com erro)`;
  toast(msg);
}

/* ===================== ADMIN · MODAL FIDELIDADE CLIENTE ===================== */
let loyaltyModalCurrentPhone = '';

async function openLoyaltyModal(name, phone, loyaltyCount){
  loyaltyModalCurrentPhone = phone;
  document.getElementById('loyaltyModalName').textContent = name || 'Cliente';
  const phoneFormatted = formatPhoneBR(phone);
  document.getElementById('loyaltyModalPhone').textContent = phoneFormatted;
  document.getElementById('loyaltyModalBody').innerHTML = `<div style="padding:24px; text-align:center; color:var(--muted); font-size:.85rem;">Carregando fidelidade...</div>`;
  document.getElementById('loyaltyModalOverlay').classList.add('show');

  // Busca visitas do cliente
  let visits = [];
  let total = loyaltyCount || 0;
  if(phone){
    try{
      const res = await apiPost('getLoyalty', { phone });
      if(!res.error){
        total = res.total || 0;
        visits = res.visits || [];
      }
    } catch(e){}
  }

  renderLoyaltyModalBody(name, total, visits);
}

function renderLoyaltyModalBody(name, total, visits){
  const pct = Math.min((total / LOYALTY_TOTAL) * 100, 100);
  const msg = buildLoyaltyNextMsg(total);
  const nextMsg = `<div style="background:${msg.bg};border:1px solid ${msg.border};border-radius:8px;padding:8px 12px;text-align:center;font-size:.78rem;color:${msg.color};margin-bottom:18px;">${msg.text}</div>`;
  const histHtml = visits.length
    ? `<div style="padding:0 22px;">${buildHistoryHTML(visits)}</div>`
    : `<div style="padding:12px 22px; font-size:.82rem; color:var(--muted); text-align:center;">Nenhuma visita validada ainda.</div>`;

  const resetBtn = total >= 10 ? `
    <div style="margin:14px 0 0; padding:12px 14px; background:rgba(63,174,102,.08); border:1px solid rgba(63,174,102,.25); border-radius:10px;">
      <div style="font-size:.78rem; color:var(--green-bright); margin-bottom:10px;">🎉 Cliente com direito ao serviço GRÁTIS! Após o uso do brinde, zere o cartão.</div>
      <button class="btn btn-green" style="width:100%;" onclick="confirmResetLoyalty('${escapeForJsAttr(name||'')}')">🔄 Zerar cartão fidelidade</button>
    </div>` : '';

  document.getElementById('loyaltyModalBody').innerHTML = `
    <div class="loyalty-card" style="margin:18px 22px;">
      <div class="loyalty-header">
        <div>
          <div class="loyalty-title">Cartão Fidelidade</div>
          <div class="loyalty-sub">Monteiro Barbearia</div>
        </div>
        <div class="loyalty-badge">${total}/${LOYALTY_TOTAL}</div>
      </div>
      <div class="loyalty-progress-wrap">
        <div class="loyalty-progress-bar" style="width:${pct}%"></div>
      </div>
      ${nextMsg}
      <div class="loyalty-grid">${buildLoyaltySealsHTML(total)}</div>
      <div class="loyalty-legend">
        <span class="loyalty-dot filled"></span> Visita validada &nbsp;&nbsp;
        <span class="loyalty-dot"></span> Aguardando
      </div>
      ${resetBtn}
    </div>
    <div style="padding:0 22px 4px; font-size:.7rem; letter-spacing:.14em; text-transform:uppercase; color:var(--red); display:flex; align-items:center; gap:10px;">
      <span>Histórico de visitas</span><div style="flex:1;height:1px;background:var(--red-dim);"></div>
    </div>
    ${histHtml}
  `;
}

function closeLoyaltyModalDirect(){
  document.getElementById('loyaltyModalOverlay').classList.remove('show');
}
function closeLoyaltyModal(e){
  if(e.target === document.getElementById('loyaltyModalOverlay')) closeLoyaltyModalDirect();
}

function confirmResetLoyalty(name){
  if(!confirm(`Confirma o uso do brinde e zeramento do cartão de ${name}?\n\nEsta ação irá apagar todas as visitas do cartão fidelidade atual.`)) return;
  resetLoyaltyCard(name);
}

async function resetLoyaltyCard(name){
  const phone = loyaltyModalCurrentPhone;
  if(!phone){ toast('Erro: telefone não encontrado'); return; }
  toast('Zerando cartão...');
  const res = await apiPost('resetLoyalty', { phone });
  if(res.error){ toast('Erro: ' + res.error); return; }
  // Atualiza o cache de clientes
  const idx = clientesCache.findIndex(c => String(c.phone).replace(/\D/g,'') === phone);
  if(idx !== -1) clientesCache[idx].loyaltyCount = 0;
  toast(`✅ Cartão de ${name} zerado! Novo ciclo iniciado.`, 4000);
  renderLoyaltyModalBody(name, 0, []);
}

/* ===================== ADMIN · CLIENTES ===================== */
let clientesCache = [];
async function renderClientesTab(){
  const wrap = document.getElementById('clientesList');
  if(!wrap) return;

  if(!clientesCache.length){
    wrap.innerHTML = `<div class="empty-note">Carregando...</div>`;
    const res = await apiPost('getClients', {});
    if(res.error){ wrap.innerHTML = `<div class="empty-note">Erro ao carregar clientes.</div>`; return; }
    clientesCache = Array.isArray(res) ? res : [];
  }

  const q = (document.getElementById('clientSearch')?.value || '').toLowerCase().trim();
  let list = clientesCache;
  if(q) list = list.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.phone||'').includes(q.replace(/\D/g,''))
  );

  if(!list.length){
    wrap.innerHTML = `<div class="empty-note">Nenhum cliente encontrado.</div>`;
    return;
  }

  wrap.innerHTML = list.map(c => {
    const days = c.daysSinceValidated !== null ? c.daysSinceValidated : c.daysSinceBooking;
    let colorClass = '';
    if(days === null)      colorClass = '';
    else if(days <= 15)   colorClass = 'green';
    else if(days <= 30)   colorClass = 'yellow';
    else                  colorClass = 'red';

    const daysLabel = days !== null
      ? `${days} dia${days !== 1 ? 's' : ''} sem visita`
      : 'Sem visitas';

    const phone = String(c.phone||'').replace(/\D/g,'');
    const phoneFormatted = formatPhoneBR(phone) || '—';
    const loyalty = c.loyaltyCount || 0;
    const loyaltyNext = loyalty >= 10 ? '🎉 Grátis!' : loyalty >= 5 ? `${10-loyalty} p/ grátis` : `${5-loyalty} p/ 10% OFF`;

    // Mensagem WhatsApp personalizada
    let waText = `Ola, ${c.name}! Tudo bem? Passando para lembrar que ja faz ${days} dias desde o seu ultimo atendimento. Saudades de voce aqui na Barbearia Monteiro!`;
    if(loyalty >= 6 && loyalty < 11){
      waText += ` Voce esta a ${11-loyalty} visita${10-loyalty>1?'s':''} de ganhar um servico GRATIS!`;
    } else if(loyalty < 5){
      waText += ` Voce esta a ${6-loyalty} visita${5-loyalty>1?'s':''} de ganhar 10% OFF!`;
    } else if(loyalty >= 10){
      waText += ` Voce ja tem direito a um servico GRATIS!`;
    }
    const waLink = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(waText)}` : '';

    const clientNameSafe = escapeForJsAttr(c.name || '');
    return `
      <div class="client-card ${colorClass}" onclick="openLoyaltyModal('${clientNameSafe}','${String(c.phone||'').replace(/\D/g,'')}',${loyalty})">
        <div class="client-card-top">
          <div>
            <div class="client-name">${escapeHtml(c.name || 'Sem nome')}</div>
            <div class="client-phone">${phoneFormatted}</div>
          </div>
          ${days !== null ? `<span class="client-days-badge ${colorClass}">${daysLabel}</span>` : ''}
        </div>
        <div class="client-card-bottom">
          <div class="client-loyalty">
            Fidelidade: <strong>${loyalty}/11</strong>
            <span style="color:var(--muted);"> · ${loyaltyNext}</span>
          </div>
          <div style="display:flex; gap:8px;">
            ${waLink ? `<button class="icon-btn small" onclick="event.stopPropagation(); openWhatsApp('${waLink}')" title="Enviar mensagem" style="color:#25D366;">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.528 5.845L0 24l6.335-1.505A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.652-.513-5.168-1.407l-.371-.22-3.762.894.952-3.653-.242-.386A9.94 9.94 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            </button>` : ''}
            <button class="icon-btn small" onclick="event.stopPropagation(); confirmDeleteClient('${clientNameSafe}','${phone}')" title="Excluir cliente" style="color:var(--red-bright);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ===================== ADMIN · EXCLUIR CLIENTE ===================== */
function confirmDeleteClient(name, phone){
  if(!confirm(`Tem certeza que deseja excluir o cliente "${name}"?\n\nEsta ação não pode ser desfeita.`)) return;
  deleteClient(name, phone);
}

async function deleteClient(name, phone){
  toast('Excluindo...');
  const res = await apiPost('deleteClient', { phone });
  if(res.error){ toast('Erro: ' + res.error); return; }
  clientesCache = clientesCache.filter(c => String(c.phone).replace(/\D/g,'') !== String(phone).replace(/\D/g,''));
  toast(`✅ ${name} excluído!`);
  renderClientesTab();
}

/* ===================== ADMIN · CAIXA ===================== */
let caixaCalYear  = new Date().getFullYear();
let caixaCalMonth = new Date().getMonth();
let caixaRangeFrom = isoOffset(0);
let caixaRangeTo   = isoOffset(0);

function caixaCalPrev(){
  caixaCalMonth--;
  if(caixaCalMonth < 0){ caixaCalMonth = 11; caixaCalYear--; }
  renderCaixaCal();
}
function caixaCalNext(){
  caixaCalMonth++;
  if(caixaCalMonth > 11){ caixaCalMonth = 0; caixaCalYear++; }
  renderCaixaCal();
}
function caixaCalToday(){
  caixaCalYear  = new Date().getFullYear();
  caixaCalMonth = new Date().getMonth();
  caixaRangeFrom = isoOffset(0);
  caixaRangeTo   = isoOffset(0);
  syncCaixaRangeInputs();
  renderCaixaCal();
  renderCaixaList();
}
// Clique no calendário = atalho pra filtrar só aquele dia (define início e fim iguais).
// Pra um período maior, o admin usa os dois campos de data abaixo do calendário.
function caixaCalSelectDay(iso){
  caixaRangeFrom = iso;
  caixaRangeTo   = iso;
  syncCaixaRangeInputs();
  renderCaixaCal();
  renderCaixaList();
}
function syncCaixaRangeInputs(){
  const fromEl = document.getElementById('caixaFrom');
  const toEl   = document.getElementById('caixaTo');
  if(fromEl) fromEl.value = caixaRangeFrom;
  if(toEl)   toEl.value   = caixaRangeTo;
}
function updateCaixaRange(){
  const fromEl = document.getElementById('caixaFrom');
  const toEl   = document.getElementById('caixaTo');
  if(!fromEl.value || !toEl.value) return;
  caixaRangeFrom = fromEl.value;
  caixaRangeTo   = toEl.value;
  if(caixaRangeFrom > caixaRangeTo){ [caixaRangeFrom, caixaRangeTo] = [caixaRangeTo, caixaRangeFrom]; syncCaixaRangeInputs(); }
  renderCaixaCal();
  renderCaixaList();
}
function renderCaixaCal(){
  const label = document.getElementById('caixaCalMonthLabel');
  const grid  = document.getElementById('caixaCalGrid');
  if(!label || !grid) return;
  label.textContent = `${monthNames[caixaCalMonth]} ${caixaCalYear}`;

  const today        = isoOffset(0);
  const bookedDays   = new Set(bookings.map(b => String(b.date).slice(0,10)));
  const firstDay     = new Date(caixaCalYear, caixaCalMonth, 1).getDay();
  const daysInMonth  = new Date(caixaCalYear, caixaCalMonth + 1, 0).getDate();
  const daysInPrev   = new Date(caixaCalYear, caixaCalMonth, 0).getDate();

  let html = '';
  for(let i = firstDay - 1; i >= 0; i--){
    html += `<div class="cal-day other-month"></div>`;
  }
  for(let d = 1; d <= daysInMonth; d++){
    const iso       = `${caixaCalYear}-${String(caixaCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday   = iso === today;
    // Destaca o período inteiro selecionado no calendário, não só um dia.
    const isInRange = caixaRangeFrom && caixaRangeTo && iso >= caixaRangeFrom && iso <= caixaRangeTo;
    const hasBk     = bookedDays.has(iso);
    let cls = 'cal-day';
    if(isInRange) cls += ' selected';
    else if(isToday) cls += ' today';
    if(hasBk && !isInRange) cls += ' has-booking';
    html += `<div class="${cls}" onclick="caixaCalSelectDay('${iso}')">${d}</div>`;
  }
  const total = firstDay + daysInMonth;
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for(let d = 1; d <= rem; d++){
    html += `<div class="cal-day other-month"></div>`;
  }
  grid.innerHTML = html;
}
function renderCaixaTab(){
  const profSelect = document.getElementById('caixaProfFilter');
  profSelect.innerHTML = `<option value="all">Todos os colaboradores</option>` +
    professionals.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  caixaCalYear  = new Date().getFullYear();
  caixaCalMonth = new Date().getMonth();
  caixaRangeFrom = isoOffset(0);
  caixaRangeTo   = isoOffset(0);
  syncCaixaRangeInputs();
  renderCaixaCal();
  renderCaixaList();
}
function renderCaixaList(){
  const profId = document.getElementById('caixaProfFilter') ? document.getElementById('caixaProfFilter').value : 'all';
  // Só entra na Caixa o que foi validado pelo barbeiro (visita confirmada = serviço pago).
  let list = bookings.filter(b => {
    const dateIso = String(b.date).slice(0,10);
    return dateIso >= caixaRangeFrom && dateIso <= caixaRangeTo && validatedBookingIds.has(String(b.id));
  });
  if(profId !== 'all') list = list.filter(b => b.profId === Number(profId));
  list.sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));

  const wrap = document.getElementById('caixaList');
  const count = list.length;
  const df = new Date(caixaRangeFrom+'T00:00');
  const dt = new Date(caixaRangeTo+'T00:00');
  const rangeLabel = caixaRangeFrom === caixaRangeTo
    ? `${weekdayFull[df.getDay()]}, ${String(df.getDate()).padStart(2,'0')} de ${monthNames[df.getMonth()]}`
    : `${String(df.getDate()).padStart(2,'0')}/${String(df.getMonth()+1).padStart(2,'0')} a ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('caixaCount').textContent = `${rangeLabel} · ${count === 0 ? 'nenhum serviço' : count + (count === 1 ? ' serviço' : ' serviços')}`;

  if(!list.length){
    wrap.innerHTML = `<div class="empty-note">Nenhum serviço validado nesse período/filtro.</div>`;
    document.getElementById('caixaByPayment').innerHTML = '';
  } else {
    wrap.innerHTML = list.map(b => {
      const s = services.find(x => x.id === b.serviceId);
      const p = professionals.find(x => x.id === b.profId);
      // Corrige datas que vieram como objeto Date do Sheets
      let dateStr = b.date;
      if(dateStr instanceof Date || (typeof dateStr === 'string' && dateStr.includes('T'))){
        try { dateStr = new Date(dateStr).toISOString().slice(0,10); } catch(e){}
      }
      let timeStr = b.time;
      if(timeStr instanceof Date || (typeof timeStr === 'string' && timeStr.includes('T'))){
        try { const t = new Date(timeStr); timeStr = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`; } catch(e){}
      }
      const d = dateStr ? new Date(dateStr + 'T00:00') : null;
      const dateLabel = d ? `${weekdayLabel[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}` : '—';
      const payLabel = b.payment ? `💳 ${b.payment}` : '';
      const phone = String(b.clientPhone || '').replace(/\D/g,'');
      const waMsg = encodeURIComponent(`Ola ${b.clientName || 'cliente'}! Este e um lembrete da Barbearia Monteiro. Voce tem um agendamento de ${s ? s.name : 'servico'} marcado para ${dateLabel} as ${timeStr || '—'}. Aguardamos voce!`);
      const waLink = phone ? `https://wa.me/55${phone}?text=${waMsg}` : '';
      return `
        <div class="service-card">
          <div class="service-bar"></div>
          <div class="service-info">
            <h3>${escapeHtml(b.clientName || 'Cliente')}</h3>
            <p>${s ? s.name : 'Serviço'} · ${p ? p.name : '—'} · ${dateLabel} · ${timeStr || '—'}</p>
            ${payLabel ? `<p style="color:var(--green-bright); font-size:.8rem; margin-top:2px;">${payLabel}</p>` : ''}
          </div>
          <div class="service-price"><strong>R$ ${s ? s.price : 0}</strong></div>
          ${waLink ? `<button class="icon-btn small" onclick="openWhatsApp('${waLink}')" title="Enviar lembrete via WhatsApp" style="color:#25D366;">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.528 5.845L0 24l6.335-1.505A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.652-.513-5.168-1.407l-.371-.22-3.762.894.952-3.653-.242-.386A9.94 9.94 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          </button>` : ''}
          <button class="icon-btn small danger" onclick="adminCancelBooking(${b.id})" title="Cancelar agendamento">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
          </button>
        </div>
      `;
    }).join('');

    // Total separado por forma de pagamento (a que o cliente escolheu ao agendar)
    const paymentIcons = { 'Pix': '💠', 'Crédito': '💳', 'Débito': '💳', 'Dinheiro': '💵' };
    const byPayment = {};
    list.forEach(b => {
      const s = services.find(x => x.id === b.serviceId);
      const method = b.payment || 'Não informado';
      byPayment[method] = (byPayment[method] || 0) + (s ? Number(s.price) : 0);
    });
    document.getElementById('caixaByPayment').innerHTML = Object.entries(byPayment).map(([method, sum]) => `
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--red-dim); font-size:.85rem;">
        <span>${paymentIcons[method] || '💰'} ${method}</span>
        <strong>R$ ${sum}</strong>
      </div>
    `).join('');
  }

  const total = list.reduce((sum, b) => {
    const s = services.find(x => x.id === b.serviceId);
    return sum + (s ? s.price : 0);
  }, 0);
  document.getElementById('caixaTotal').textContent = `R$ ${total}`;
}

/* ===================== INIT ===================== */
async function init(){
  initFcm();
  try{
    await loadData();
  } catch(e){
    toast('Não foi possível carregar os dados do servidor. Verifique sua internet.');
    console.error(e);
  }
  renderHeroHours();
  renderCategoryChips();
  renderServices();
  renderServicePlans();
  renderAppointments();

  // Restaura sessão salva (mantém logado após recarregar)
  const session = restoreSession();
  if(session){
    state.userName  = session.userName  || 'Cliente';
    state.userPhone = session.userPhone || null;
    if(session.isAdmin){
      // enterAdmin() reconfirma o token com o servidor antes de liberar o painel —
      // um "isAdmin:true" sozinho no localStorage não basta (poderia ser forjado).
      state.adminToken = session.adminToken || null;
      await enterAdmin();
    } else {
      state.loggedIn = true; state.isAdmin = false;
      document.getElementById('homeUserName').textContent = capitalize((state.userName||'').split(' ')[0]);
      document.getElementById('navAdmin').style.display = 'none';
      renderCategoryChips(); renderServices();
      showScreen('screen-home'); setNav('home');
      updateReminderBanner();
      await loadMyBookings();
      renderAppointments();
    }
  }
}
init();

// Atualiza a lista de agendamentos sempre que a tela for aberta
document.getElementById('navAppt').addEventListener('click', renderAppointments);

// PWA: registra o service worker (apenas para permitir instalação, sem cache offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

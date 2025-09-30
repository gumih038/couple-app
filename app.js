import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, push, remove, onDisconnect, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

let db;
const ROOM_ID = 'couple_room_001';
let userRole = '';
let isPartnerOnline = false;
let hasShownOnlineNotification = false;

// 通知権限
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

function showPush(title, body){
  if ('Notification' in window && Notification.permission === 'granted'){
    const n = new Notification(title,{ body, tag:'couple-app' });
    n.onclick = () => { window.focus(); n.close(); };
  }
  if ('vibrate' in navigator) navigator.vibrate([120,80,120]);
}

// 起動
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bootstrap);
}else{
  bootstrap();
}

function bootstrap(){
  const cfgStr = localStorage.getItem('firebaseConfig');
  if (cfgStr){
    try{
      connectFirebase(JSON.parse(cfgStr));
    }catch{
      localStorage.removeItem('firebaseConfig');
    }
  }
  
  const saveBtn = document.getElementById('saveConfigBtn');
  if (saveBtn){
    const handleSave = (e)=>{
      e.preventDefault();
      const config = {
        apiKey: document.getElementById('apiKey').value.trim(),
        authDomain: document.getElementById('authDomain').value.trim(),
        projectId: document.getElementById('projectId').value.trim(),
        databaseURL: document.getElementById('databaseURL').value.trim()
      };
      if (!config.apiKey || !config.authDomain || !config.projectId || !config.databaseURL){
        alert('すべての項目を入力してください');
        return;
      }
      localStorage.setItem('firebaseConfig', JSON.stringify(config));
      connectFirebase(config);
    };
    saveBtn.addEventListener('click', handleSave);
    saveBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); handleSave(e); }, {passive:false});
  }
}

function connectFirebase(config){
  try{
    const app = initializeApp(config);
    db = getDatabase(app);

    document.getElementById('firebaseSetup').classList.add('hidden');
    document.getElementById('roleSelect').classList.remove('hidden');

    const setRole = (role)=>{
      userRole = role;
      localStorage.setItem('userRole', role);
      document.getElementById('roleSelect').classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      
      const header = document.getElementById('header');
      const headerTitle = document.getElementById('headerTitle');
      
      if (role === 'boyfriend'){
        header.className = 'header boyfriend';
        headerTitle.textContent = '👨 彼氏モード';
        document.getElementById('partnerLabel').textContent = '彼女の気分';
      }else{
        header.className = 'header girlfriend';
        headerTitle.textContent = '👩 彼女モード';
        document.getElementById('partnerLabel').textContent = '彼氏の気分';
      }
      initApp();
    };

    document.getElementById('boyfriendBtn').addEventListener('click', ()=>setRole('boyfriend'));
    document.getElementById('girlfriendBtn').addEventListener('click', ()=>setRole('girlfriend'));
    document.getElementById('boyfriendBtn').addEventListener('touchstart', (e)=>{ e.preventDefault(); setRole('boyfriend'); }, {passive:false});
    document.getElementById('girlfriendBtn').addEventListener('touchstart', (e)=>{ e.preventDefault(); setRole('girlfriend'); }, {passive:false});

    const savedRole = localStorage.getItem('userRole');
    if (savedRole) setRole(savedRole);

  }catch(err){
    alert('Firebase接続エラー ' + err.message);
    localStorage.removeItem('firebaseConfig');
  }
}

function initApp(){
  setupPresence();
  setupMoodButtons();
  setupStatusButtons();
  setupChat();
  setupTyping();
  setupTodos();
  subscribePartnerState();
}

// Presence
function setupPresence(){
  const myRef = ref(db, `rooms/${ROOM_ID}/presence/${userRole}`);
  const partnerRole = userRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
  const partnerRef = ref(db, `rooms/${ROOM_ID}/presence/${partnerRole}`);

  set(myRef, { online:true, ts: Date.now() });
  onDisconnect(myRef).set({ online:false, ts: Date.now() });

  setInterval(() => {
    set(myRef, { online:true, ts: Date.now() });
  }, 30000);

  onValue(partnerRef, snap=>{
    const v = snap.val();
    const online = v && v.online && (Date.now() - v.ts < 60000);
    const wasOnline = isPartnerOnline;
    isPartnerOnline = !!online;
    
    document.querySelector('#partnerStatus .status-dot').classList.toggle('offline', !online);
    document.querySelector('#partnerStatus .status-dot').classList.toggle('online', online);
    document.getElementById('partnerStatusText').textContent = online ? '相手: オンライン' : '相手: オフライン';
    
    if (online && !wasOnline && hasShownOnlineNotification){
      showPush('💚 相手がオンラインになりました', '今ならすぐに返信が届きます');
    }
    hasShownOnlineNotification = true;
  });
}

// Mood
function setupMoodButtons(){
  const buttons = document.querySelectorAll('.mood-btn');
  const myMoodRef = ref(db, `rooms/${ROOM_ID}/mood/${userRole}`);
  const myMoodTime = document.getElementById('myMoodTime');

  buttons.forEach(btn=>{
    const setMood = ()=>{
      buttons.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const mood = btn.dataset.mood;
      set(myMoodRef, { mood, ts: Date.now() });
      myMoodTime.textContent = formatTime(Date.now());
    };
    btn.addEventListener('click', setMood);
    btn.addEventListener('touchstart', (e)=>{ e.preventDefault(); setMood(); }, {passive:false});
  });
}

// Status
function setupStatusButtons(){
  const btns = document.querySelectorAll('.status-btn');
  const myStatusRef = ref(db, `rooms/${ROOM_ID}/status/${userRole}`);
  const myStatusTime = document.getElementById('myStatusTime');

  btns.forEach(btn=>{
    const choose = ()=>{
      btns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      set(myStatusRef, { text: btn.dataset.status, ts: Date.now() });
      myStatusTime.textContent = formatTime(Date.now());
    };
    btn.addEventListener('click', choose);
    btn.addEventListener('touchstart', (e)=>{ e.preventDefault(); choose(); }, {passive:false});
  });
}

// Chat
function setupChat(){
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const listEl = document.getElementById('chatMessages');
  const msgsRef = ref(db, `rooms/${ROOM_ID}/messages`);

  const send = ()=>{
    const text = input.value.trim();
    if (!text) return;
    const msgRef = push(msgsRef);
    set(msgRef, {
      type:'chat',
      from: userRole,
      text,
      ts: Date.now(),
      readBy: { [userRole]: Date.now() }
    });
    input.value = '';
    setTyping(false);
  };

  sendBtn.addEventListener('click', send);
  sendBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); send(); }, {passive:false});
  
  input.addEventListener('keypress', (e)=>{
    if (e.key === 'Enter'){
      e.preventDefault();
      send();
    }
  });

  input.addEventListener('input', ()=>{
    setTyping(true);
    scheduleTypingOff();
  });

  onValue(msgsRef, snap=>{
    listEl.innerHTML = '';
    const data = snap.val() || {};
    const arr = Object.entries(data).sort((a,b)=>a[1].ts - b[1].ts);
    const partnerRole = userRole === 'boyfriend' ? 'girlfriend':'boyfriend';

    arr.forEach(([id,m])=>{
      const div = document.createElement('div');
      if (m.type === 'system'){
        div.className = 'message system';
        div.innerHTML = `<div class="message-content">${escapeHTML(m.text)}</div><div class="message-time">${formatTime(m.ts)}</div>`;
      }else{
        const isYou = m.from === userRole;
        div.className = `message ${isYou ? 'you':'partner'}`;
        const read = m.readBy && m.readBy[partnerRole] ? ' ✓' : '';
        div.innerHTML = `
          <div class="message-content">${linkify(escapeHTML(m.text))}</div>
          <div class="message-time">${formatTime(m.ts)}${read}</div>
        `;
        
        if (!isYou && (!m.readBy || !m.readBy[userRole])){
          const patch = {};
          patch[`rooms/${ROOM_ID}/messages/${id}/readBy/${userRole}`] = Date.now();
          update(ref(db), patch);
          
          showPush('💬 新しいメッセージ', m.text);
        }
      }
      listEl.appendChild(div);
    });
    listEl.scrollTop = listEl.scrollHeight;
  });
}

// Typing indicator
let typingTimer = null;

function setupTyping(){
  const partnerRole = userRole === 'boyfriend' ? 'girlfriend':'boyfriend';
  const partnerTypingRef = ref(db, `rooms/${ROOM_ID}/typing/${partnerRole}`);
  onValue(partnerTypingRef, snap=>{
    const v = !!snap.val();
    document.getElementById('typingIndicator').textContent = v ? '✏️ 入力中...' : '';
  });
}

function setTyping(v){
  set(ref(db, `rooms/${ROOM_ID}/typing/${userRole}`), v);
}

function scheduleTypingOff(){
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(()=> setTyping(false), 1200);
}

// Todos
function setupTodos(){
  const addBtn = document.getElementById('addTodoBtn');
  const titleEl = document.getElementById('todoTitle');
  const dueEl = document.getElementById('todoDue');
  const listEl = document.getElementById('todoList');
  const todosRef = ref(db, `rooms/${ROOM_ID}/todos`);
  const syncEl = document.getElementById('todoSyncStatus');

  function render(list){
    listEl.innerHTML = '';
    Object.entries(list)
      .sort((a,b)=> (a[1].done||0) - (b[1].done||0) || (a[1].due||Infinity) - (b[1].due||Infinity))
      .forEach(([id,t])=>{
        const li = document.createElement('li');
        li.className = 'todo-item';
        const dueText = t.due ? new Date(t.due).toLocaleString('ja-JP', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
        li.innerHTML = `
          <input type="checkbox" ${t.done?'checked':''} aria-label="完了" />
          <div class="title">${escapeHTML(t.title || '')}</div>
          <div class="due">${dueText}</div>
          <button class="remove">削除</button>
        `;
        const [chk, , , rm] = li.children;
        chk.addEventListener('change', ()=> set(ref(db, `rooms/${ROOM_ID}/todos/${id}/done`), chk.checked ? Date.now() : null));
        rm.addEventListener('click', ()=> remove(ref(db, `rooms/${ROOM_ID}/todos/${id}`)));
        listEl.appendChild(li);
      });
  }

  addBtn.addEventListener('click', ()=>{
    const title = titleEl.value.trim();
    if (!title) return;
    push(todosRef, { 
      title, 
      due: dueEl.value ? new Date(dueEl.value).getTime() : null, 
      createdBy: userRole, 
      ts: Date.now(), 
      done: null 
    });
    titleEl.value = '';
    dueEl.value = '';
  });

  onValue(todosRef, snap=>{
    render(snap.val() || {});
  });

  window.addEventListener('online', ()=> syncEl.textContent = 'オンライン');
  window.addEventListener('offline', ()=> syncEl.textContent = 'オフライン');
  syncEl.textContent = navigator.onLine ? 'オンライン':'オフライン';
}

// Partner state subscription
function subscribePartnerState(){
  const partnerRole = userRole === 'boyfriend' ? 'girlfriend':'boyfriend';
  const moodRef = ref(db, `rooms/${ROOM_ID}/mood/${partnerRole}`);
  const statusRef = ref(db, `rooms/${ROOM_ID}/status/${partnerRole}`);
  
  let lastMood = '';
  let lastStatus = '';

  onValue(moodRef, snap=>{
    const v = snap.val();
    if (!v) return;
    
    const emoji = v.mood === 'good' ? '😊' : v.mood === 'bad' ? '😔' : '😐';
    const label = v.mood === 'good' ? '嬉しい' : v.mood === 'bad' ? 'あまり良くない' : '普通';
    
    document.getElementById('partnerMoodEmoji').textContent = emoji;
    const s = document.getElementById('partnerMoodStatus');
    s.textContent = label;
    s.classList.remove('good','normal','bad');
    s.classList.add(v.mood);
    document.getElementById('partnerMoodTime').textContent = formatTimeRelative(v.ts);
    
    if (lastMood && lastMood !== v.mood){
      if (v.mood === 'bad'){
        showPush('😔 気分の変化', `相手の気分があまり良くないようです`);
      }
    }
    lastMood = v.mood;
  });

  onValue(statusRef, snap=>{
    const v = snap.val();
    if (!v) return;
    
    document.getElementById('partnerCurrentStatus').textContent = v.text || 'ステータス未設定';
    document.getElementById('partnerStatusTime').textContent = formatTimeRelative(v.ts);
    
    if (lastStatus && lastStatus !== v.text){
      showPush('📍 ステータス更新', v.text);
    }
    lastStatus = v.text;
  });
  
  setInterval(() => {
    onValue(moodRef, snap=>{
      const v = snap.val();
      if (v) document.getElementById('partnerMoodTime').textContent = formatTimeRelative(v.ts);
    }, { onlyOnce: true });
    
    onValue(statusRef, snap=>{
      const v = snap.val();
      if (v) document.getElementById('partnerStatusTime').textContent = formatTimeRelative(v.ts);
    }, { onlyOnce: true });
  }, 60000);
}

// Util
function formatTime(ts){
  try{
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  }catch{
    return '';
  }
}

function formatTimeRelative(ts){
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '今';
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  return `${days}日前`;
}

function escapeHTML(s){ 
  return s.replace(/[&<>"']/g, c=>({ 
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;' 
  }[c])); 
}

function linkify(text){
  const urlRe = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRe, '<a href="$1" target="_blank" rel="noopener" style="color:#667eea;text-decoration:underline">$1</a>');
}

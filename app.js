import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, push, remove, onDisconnect, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

let db;
const ROOM_ID = 'couple_room_001';
let userRole = '';
let isPartnerOnline = false;
let hasShownOnlineNotification = false;

// 設定のデフォルト値
let settings = {
  notifyMood: true,
  notifyStatus: true,
  notifyMessage: true,
  notifyOnline: true,
  animateMessages: true,
  showRead: true,
  showTyping: true,
  autoDelete: true
};

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
  loadSettings();
  
  const cfgStr = localStorage.getItem('firebaseConfig');
  if (cfgStr){
    try{
      const config = JSON.parse(cfgStr);
      connectFirebase(config);
    }catch{
      localStorage.removeItem('firebaseConfig');
      // エラー時は設定画面を表示
      document.getElementById('firebaseSetup').classList.remove('hidden');
    }
  }
  
  const saveBtn = document.getElementById('saveConfigBtn');
  if (saveBtn){
    // 既存のイベントリスナーをクリア
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    const handleSave = (e)=>{
      e.preventDefault();
      const config = {
        apiKey: document.getElementById('apiKey').value.trim(),
        authDomain: document.getElementById('authDomain').value.trim(),
        projectId: document.getElementById('projectId').value.trim(),
        databaseURL: document.getElementById('databaseURL').value.trim(),
        storageBucket: document.getElementById('storageBucket').value.trim()
      };
      if (!config.apiKey || !config.authDomain || !config.projectId || !config.databaseURL || !config.storageBucket){
        alert('すべての項目を入力してください');
        return;
      }
      localStorage.setItem('firebaseConfig', JSON.stringify(config));
      
      // 画面遷移を確実に実行
      try{
        connectFirebase(config);
      }catch(err){
        alert('Firebase接続エラー: ' + err.message);
        localStorage.removeItem('firebaseConfig');
      }
    };
    
    newSaveBtn.addEventListener('click', handleSave);
    newSaveBtn.addEventListener('touchstart', (e)=>{ 
      e.preventDefault(); 
      handleSave(e); 
    }, {passive:false});
  }
}
function connectFirebase(config){
  try{
    // 既存のFirebaseアプリがあれば削除
    const existingApps = typeof firebase !== 'undefined' ? firebase.apps : [];
    
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
      
      document.getElementById('currentRole').textContent = role === 'boyfriend' ? '彼氏' : '彼女';
      initApp();
    };

    // 既存のイベントリスナーを削除してから新しく追加
    const boyfriendBtn = document.getElementById('boyfriendBtn');
    const girlfriendBtn = document.getElementById('girlfriendBtn');
    
    const newBoyfriendBtn = boyfriendBtn.cloneNode(true);
    const newGirlfriendBtn = girlfriendBtn.cloneNode(true);
    
    boyfriendBtn.parentNode.replaceChild(newBoyfriendBtn, boyfriendBtn);
    girlfriendBtn.parentNode.replaceChild(newGirlfriendBtn, girlfriendBtn);
    
    newBoyfriendBtn.addEventListener('click', ()=>setRole('boyfriend'));
    newGirlfriendBtn.addEventListener('click', ()=>setRole('girlfriend'));
    newBoyfriendBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); setRole('boyfriend'); }, {passive:false});
    newGirlfriendBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); setRole('girlfriend'); }, {passive:false});

    const savedRole = localStorage.getItem('userRole');
    if (savedRole) setRole(savedRole);

  }catch(err){
    alert('Firebase接続エラー: ' + err.message);
    localStorage.removeItem('firebaseConfig');
  }
}
function initApp(){
  setupTabs();
  setupPresence();
  setupMoodButtons();
  setupStatusButtons();
  setupChat();
  setupTyping();
  setupTodos();
  subscribePartnerState();
  setupSettings();
  setupAnniversary();
  setupPeriodTracker();
  setupTimeCapsule();
}

// タブ切り替え
function setupTabs(){
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', function(){
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      const screenId = this.dataset.screen;
      document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
      document.getElementById(screenId).classList.remove('hidden');
    });
  });
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
    
    if (online && !wasOnline && hasShownOnlineNotification && settings.notifyOnline){
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
    if(settings.showTyping){
      setTyping(true);
      scheduleTypingOff();
    }
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
        const read = settings.showRead && m.readBy && m.readBy[partnerRole] ? ' ✓' : '';
        div.innerHTML = `
          <div class="message-content">${linkify(escapeHTML(m.text))}</div>
          <div class="message-time">${formatTime(m.ts)}${read}</div>
        `;
        
        if (!isYou && (!m.readBy || !m.readBy[userRole])){
          const patch = {};
          patch[`rooms/${ROOM_ID}/messages/${id}/readBy/${userRole}`] = Date.now();
          update(ref(db), patch);
          
          if(settings.notifyMessage){
            showPush('💬 新しいメッセージ', m.text);
          }
        }
      }
      listEl.appendChild(div);
    });
    listEl.scrollTop = listEl.scrollHeight;
    
    // 24時間後に自動削除
    if(settings.autoDelete){
      const oneDayAgo = Date.now() - 86400000;
      arr.forEach(([id, m]) => {
        if(m.ts < oneDayAgo){
          remove(ref(db, `rooms/${ROOM_ID}/messages/${id}`));
        }
      });
    }
  });
}

// Typing indicator
let typingTimer = null;

function setupTyping(){
  const partnerRole = userRole === 'boyfriend' ? 'girlfriend':'boyfriend';
  const partnerTypingRef = ref(db, `rooms/${ROOM_ID}/typing/${partnerRole}`);
  onValue(partnerTypingRef, snap=>{
    const v = !!snap.val();
    if(settings.showTyping){
      document.getElementById('typingIndicator').textContent = v ? '✏️ 入力中...' : '';
    }
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
    
    if (lastMood && lastMood !== v.mood && settings.notifyMood){
      if (v.mood === 'bad'){
        showPush('😔 気分の変化', '相手の気分があまり良くないようです');
      }
    }
    lastMood = v.mood;
  });

  onValue(statusRef, snap=>{
    const v = snap.val();
    if (!v) return;
    
    document.getElementById('partnerCurrentStatus').textContent = v.text || 'ステータス未設定';
    document.getElementById('partnerStatusTime').textContent = formatTimeRelative(v.ts);
    
    if (lastStatus && lastStatus !== v.text && settings.notifyStatus){
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

// 設定
function setupSettings(){
  // 強制リセットボタン（最優先で追加）
  const forceResetBtn = document.getElementById('forceResetBtn');
  if(forceResetBtn){
    forceResetBtn.addEventListener('click', ()=>{
      if(confirm('強制的に初期画面に戻りますか？\n全ての設定がリセットされます。')){
        localStorage.clear();
        window.location.href = window.location.pathname;
      }
    });
  }
  
  // 設定値を反映
  Object.keys(settings).forEach(key => {
    const el = document.getElementById(key);
    if(el) el.checked = settings[key];
  });
  
  // 設定変更時に保存
  Object.keys(settings).forEach(key => {
    const el = document.getElementById(key);
    if(el){
      el.addEventListener('change', ()=>{
        settings[key] = el.checked;
        saveSettings();
      });
    }
  });
  
  // チャット履歴削除
  document.getElementById('clearChatBtn').addEventListener('click', ()=>{
    if(confirm('チャット履歴を全て削除しますか？')){
      remove(ref(db, `rooms/${ROOM_ID}/messages`));
      alert('削除しました');
    }
  });
  
  // TODO履歴削除
  document.getElementById('clearTodoBtn').addEventListener('click', ()=>{
    if(confirm('TODO履歴を全て削除しますか？')){
      remove(ref(db, `rooms/${ROOM_ID}/todos`));
      alert('削除しました');
    }
  });
  
  // アプリリセット
  document.getElementById('resetAppBtn').addEventListener('click', ()=>{
    if(confirm('本当にアプリをリセットしますか？\n全てのデータが削除されます。')){
      localStorage.clear();
      window.location.href = window.location.pathname;
    }
  });
}
function loadSettings(){
  const saved = localStorage.getItem('appSettings');
  if(saved){
    settings = {...settings, ...JSON.parse(saved)};
  }
}

function saveSettings(){
  localStorage.setItem('appSettings', JSON.stringify(settings));
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
  return text.replace(urlRe, '<a href="$1" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">$1</a>');
}

// 記念日カウンター
function setupAnniversary(){
  const anniversaryRef = ref(db, `rooms/${ROOM_ID}/anniversary`);
  const daysCountEl = document.getElementById('daysCount');
  const startDateEl = document.getElementById('startDate');
  const setBtn = document.getElementById('setAnniversaryBtn');
  
  setBtn.addEventListener('click', ()=>{
    const dateStr = prompt('付き合った日を入力してください（例: 2024-01-15）');
    if(!dateStr) return;
    
    const date = new Date(dateStr);
    if(isNaN(date.getTime())){
      alert('正しい日付を入力してください');
      return;
    }
    
    set(anniversaryRef, {
      startDate: date.getTime(),
      setBy: userRole
    });
  });
  
  function updateDisplay(startDate){
    const now = new Date();
    const start = new Date(startDate);
    const diffTime = now - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // 年月日を計算
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    const days = Math.floor((diffDays % 365) % 30);
    
    let displayText = '';
    if(years > 0){
      displayText = `${years}年${months}ヶ月`;
    }else if(months > 0){
      displayText = `${months}ヶ月${days}日`;
    }else{
      displayText = `${days}日`;
    }
    
    daysCountEl.textContent = displayText;
    startDateEl.textContent = start.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric'});
  }
  
  onValue(anniversaryRef, snap=>{
    if(snap.exists()){
      const data = snap.val();
      updateDisplay(data.startDate);
      setInterval(()=> updateDisplay(data.startDate), 60000);
    }
  });
}

// 女の子の日トラッカー
function setupPeriodTracker(){
  const periodRef = ref(db, `rooms/${ROOM_ID}/period`);
  const partnerRole = userRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
  
  if(userRole === 'girlfriend'){
    // 彼女側：自分で設定
    document.getElementById('periodSection').classList.remove('hidden');
    
    const startBtn = document.getElementById('periodStartBtn');
    const endBtn = document.getElementById('periodEndBtn');
    const statusEl = document.getElementById('periodStatus');
    
    startBtn.addEventListener('click', ()=>{
      set(periodRef, {
        status: 'active',
        startDate: Date.now()
      });
    });
    
    endBtn.addEventListener('click', ()=>{
      set(periodRef, {
        status: 'ended',
        endDate: Date.now()
      });
    });
    
    onValue(periodRef, snap=>{
      if(snap.exists()){
        const data = snap.val();
        if(data.status === 'active'){
          const days = Math.floor((Date.now() - data.startDate) / (1000 * 60 * 60 * 24));
          statusEl.textContent = `進行中（${days}日目）`;
        }else{
          statusEl.textContent = '終了';
        }
      }
    });
  }else{
    // 彼氏側：相手の状態を見る
    document.getElementById('partnerPeriodSection').classList.remove('hidden');
    
    onValue(periodRef, snap=>{
      const infoEl = document.getElementById('partnerPeriodInfo');
      if(snap.exists()){
        const data = snap.val();
        if(data.status === 'active'){
          const days = Math.floor((Date.now() - data.startDate) / (1000 * 60 * 60 * 24));
          infoEl.innerHTML = `
            <div class="partner-period-status">状態: 進行中（${days}日目）</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:4px;">優しく接してあげましょう</div>
          `;
        }else{
          infoEl.innerHTML = '<div class="partner-period-status">状態: 終了</div>';
        }
      }else{
        infoEl.innerHTML = '<div class="partner-period-status">状態: 未設定</div>';
      }
    });
  }
}

// タイムカプセル
function setupTimeCapsule(){
  const capsuleListEl = document.getElementById('capsuleList');
  const createBtn = document.getElementById('createCapsuleBtn');
  const capsulesRef = ref(db, `rooms/${ROOM_ID}/capsules`);
  
  createBtn.addEventListener('click', ()=>{
    const message = prompt('未来の2人へのメッセージを入力してください');
    if(!message) return;
    
    const dateStr = prompt('開封日を入力してください（例: 2025-12-31）');
    if(!dateStr) return;
    
    const openDate = new Date(dateStr);
    if(isNaN(openDate.getTime())){
      alert('正しい日付を入力してください');
      return;
    }
    
    if(openDate.getTime() <= Date.now()){
      alert('未来の日付を入力してください');
      return;
    }
    
    push(capsulesRef, {
      message: message,
      from: userRole,
      openDate: openDate.getTime(),
      created: Date.now(),
      opened: false
    });
    
    alert('タイムカプセルを作成しました！');
  });
  
  onValue(capsulesRef, snap=>{
    capsuleListEl.innerHTML = '';
    if(!snap.exists()){
      capsuleListEl.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px;">まだタイムカプセルがありません</div>';
      return;
    }
    
    const capsules = [];
    snap.forEach(child=>{
      capsules.push({id: child.key, ...child.val()});
    });
    
    capsules.sort((a,b)=> a.openDate - b.openDate);
    
    capsules.forEach(cap=>{
      const now = Date.now();
      const canOpen = now >= cap.openDate;
      const isOpened = cap.opened;
      
      const div = document.createElement('div');
      div.className = `capsule-item ${isOpened ? 'unlocked' : canOpen ? 'unlocked' : 'locked'}`;
      
      const fromName = cap.from === userRole ? 'あなた' : (userRole === 'boyfriend' ? '彼女' : '彼氏');
      
      let countdownText = '';
      if(isOpened){
        countdownText = '開封済み';
      }else if(canOpen){
        countdownText = '開封可能！';
      }else{
        const diff = cap.openDate - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        countdownText = `あと${days}日${hours}時間`;
      }
      
      div.innerHTML = `
        <div class="capsule-item-header">
          <div class="capsule-from">${fromName}から</div>
          <div class="capsule-countdown ${isOpened ? 'opened':''}">${countdownText}</div>
        </div>
        <div class="capsule-preview">${isOpened || canOpen ? cap.message : '開封日までお楽しみ...'}</div>
        <div class="capsule-date">開封日: ${new Date(cap.openDate).toLocaleDateString('ja-JP')}</div>
      `;
      
      if(canOpen && !isOpened){
        div.addEventListener('click', ()=>{
          if(confirm('タイムカプセルを開封しますか？')){
            update(ref(db, `rooms/${ROOM_ID}/capsules/${cap.id}`), {opened: true});
            
            const partnerRole = userRole === 'boyfriend' ? '彼女' : '彼氏';
            if(settings.notifyMessage){
              showPush('⏳ タイムカプセル開封！', `${fromName}からのメッセージ: ${cap.message.substring(0,50)}...`);
            }
          }
        });
      }
      
      capsuleListEl.appendChild(div);
    });
  });
}

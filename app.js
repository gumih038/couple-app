import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, onValue, push, remove, onDisconnect } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

let db, userRole = '';
const ROOM_ID = 'couple_room_001';
let isPartnerOnline = false;
let hasShownOnlineNotification = false;

// 通知権限をリクエスト
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// プッシュ通知を表示
function showPushNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: body,
            icon: '💕',
            badge: '💕',
            tag: 'couple-app',
            requireInteraction: false
        });
        
        notification.onclick = function() {
            window.focus();
            notification.close();
        };
    }
    
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
    }

    console.log('通知:', title, body);
}

// 初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
} else {
    initFirebase();
}

function initFirebase() {
    const saveBtn = document.getElementById('saveConfigBtn');
    if (saveBtn) {
        saveBtn.addEventListener('touchstart', handleSave, { passive: false });
        saveBtn.addEventListener('click', handleSave);
    }

    const configStr = localStorage.getItem('firebaseConfig');
    if (configStr) {
        try {
            const config = JSON.parse(configStr);
            connectFirebase(config);
        } catch (error) {
            localStorage.removeItem('firebaseConfig');
        }
    }
}

function handleSave(e) {
    e.preventDefault();
    const config = {
        apiKey: document.getElementById('apiKey').value.trim(),
        authDomain: document.getElementById('authDomain').value.trim(),
        projectId: document.getElementById('projectId').value.trim(),
        databaseURL: document.getElementById('databaseURL').value.trim()
    };
    if (!config.apiKey || !config.authDomain || !config.projectId || !config.databaseURL) {
        alert('すべての項目を入力してください');
        return;
    }
    localStorage.setItem('firebaseConfig', JSON.stringify(config));
    connectFirebase(config);
}

function connectFirebase(config) {
    try {
        const app = initializeApp(config);
        db = getDatabase(app);
        document.getElementById('firebaseSetup').classList.add('hidden');
        document.getElementById('roleSelect').classList.remove('hidden');
        
        document.getElementById('boyfriendBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            selectRole('boyfriend');
        });
        document.getElementById('girlfriendBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            selectRole('girlfriend');
        });
        document.getElementById('boyfriendBtn').addEventListener('click', () => selectRole('boyfriend'));
        document.getElementById('girlfriendBtn').addEventListener('click', () => selectRole('girlfriend'));
        
        const savedRole = localStorage.getItem('userRole');
        if (savedRole) selectRole(savedRole);
    } catch (error) {
        alert('Firebase接続エラー: ' + error.message);
        localStorage.removeItem('firebaseConfig');
    }
}

function selectRole(role) {
    userRole = role;
    localStorage.setItem('userRole', role);
    
    document.getElementById('roleSelect').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    const header = document.getElementById('header');
    const headerTitle = document.getElementById('headerTitle');
    
    if (role === 'boyfriend') {
        header.className = 'header boyfriend';
        headerTitle.textContent = '👨 彼氏モード';
        document.getElementById('partnerLabel').textContent = '彼女の気分';
    } else {
        header.className = 'header girlfriend';
        headerTitle.textContent = '👩 彼女モード';
        document.getElementById('partnerLabel').textContent = '彼氏の気分';
    }
    
    initApp();
}

function initApp() {
    setupMoodButtons();
    setupStatusButtons();
    setupOnlineStatus();
    loadMessages();
    cleanOldMessages();
    
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.addEventListener('touchstart', (e) => { e.preventDefault(); sendMessage(); });
    sendBtn.addEventListener('click', sendMessage);
    
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    const anxietyBtn = document.getElementById('anxietyBtn');
    anxietyBtn.addEventListener('touchstart', (e) => { e.preventDefault(); sendAnxiety(); });
    anxietyBtn.addEventListener('click', sendAnxiety);
    
    const checkBtn = document.getElementById('checkBtn');
    checkBtn.addEventListener('touchstart', (e) => { e.preventDefault(); sendCheck(); });
    checkBtn.addEventListener('click', sendCheck);
}

// 気分ボタン（3段階）
function setupMoodButtons() {
    const buttons = document.querySelectorAll('.mood-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            buttons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const mood = this.getAttribute('data-mood');
            const now = Date.now();
            set(ref(db, `${ROOM_ID}/mood/${userRole}`), {
                mood: mood,
                timestamp: now
            });
            
            document.getElementById('myMoodTime').textContent = formatTime(now);
        });
    });

    const partnerRole = userRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
    let lastMood = '';
    
    onValue(ref(db, `${ROOM_ID}/mood/${partnerRole}`), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const emoji = document.getElementById('partnerMoodEmoji');
            const status = document.getElementById('partnerMoodStatus');
            const timeLabel = document.getElementById('partnerMoodTime');
            const display = document.querySelector('.partner-mood-display');
            
            timeLabel.textContent = formatTimeWithRelative(data.timestamp);
            
            const shouldNotify = lastMood !== '' && lastMood !== data.mood;
            lastMood = data.mood;
            
            if (data.mood === 'bad') {
                emoji.textContent = '😔';
                status.textContent = 'あまり良くない';
                status.className = 'status bad';
                display.style.background = 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
                
                if (shouldNotify) {
                    showPushNotification(
                        '⚠️ 気分の変化',
                        `${partnerRole === 'girlfriend' ? '彼女' : '彼氏'}の気分があまり良くありません`
                    );
                }
            } else if (data.mood === 'normal') {
                emoji.textContent = '😐';
                status.textContent = '普通';
                status.className = 'status normal';
                display.style.background = 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)';
            } else if (data.mood === 'good') {
                emoji.textContent = '😊';
                status.textContent = '嬉しい';
                status.className = 'status good';
                display.style.background = 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)';
            }
        }
    });
    
    setInterval(() => {
        const partnerRole = userRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
        onValue(ref(db, `${ROOM_ID}/mood/${partnerRole}`), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                document.getElementById('partnerMoodTime').textContent = formatTimeWithRelative(data.timestamp);
            }
        }, { onlyOnce: true });
    }, 60000);
}

// ステータスボタン
function setupStatusButtons() {
    const buttons = document.querySelectorAll('.status-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            buttons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const status = this.getAttribute('data-status');
            const now = Date.now();
            set(ref(db, `${ROOM_ID}/status/${userRole}`), {
                text: status,
                timestamp: now
            });
            
            document.getElementById('myStatusTime').textContent = formatTime(now);
        });
    });

    const partnerRole = userRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
    let lastStatus = '';
    
    onValue(ref(db, `${ROOM_ID}/status/${partnerRole}`), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            document.getElementById('partnerCurrentStatus').textContent = data.text;
            document.getElementById('partnerStatusTime').textContent = formatTimeWithRelative(data.timestamp);
            
            if (lastStatus !== '' && lastStatus !== data.text) {
                showPushNotification(
                    '📍 ステータス更新',
                    `${partnerRole === 'girlfriend' ? '彼女' : '彼氏'}: ${data.text}`
                );
            }
            lastStatus = data.text;
        }
    });
    
    setInterval(() => {
        const partnerRole = userRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
        onValue(ref(db, `${ROOM_ID}/status/${partnerRole}`), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                document.getElementById('partnerStatusTime').textContent = formatTimeWithRelative(data.timestamp);
            }
        }, { onlyOnce: true });
    }, 60000);
}

// オンラインステータス
function setupOnlineStatus() {
    const myStatusRef = ref(db, `${ROOM_ID}/online/${userRole}`);
    set(myStatusRef, {
        status: 'online',
        lastSeen: Date.now()
    });
    
    onDisconnect(myStatusRef).set({
        status: 'offline',
        lastSeen: Date.now()
    });

    setInterval(() => {
        set(myStatusRef, {
            status: 'online',
            lastSeen: Date.now()
        });
    }, 30000);

    const partnerRole = userRole === 'boyfriend' ? 'girlfriend' : 'boyfriend';
    onValue(ref(db, `${ROOM_ID}/online/${partnerRole}`), (snapshot) => {
        const partnerStatusEl = document.getElementById('partnerStatus');
        const dot = partnerStatusEl.querySelector('.status-dot');
        const text = document.getElementById('partnerStatusText');
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            const wasOnline = isPartnerOnline;
            isPartnerOnline = data.status === 'online' && (Date.now() - data.lastSeen < 60000);
            
            if (isPartnerOnline) {
                dot.classList.remove('offline');
                dot.classList.add('online');
                text.textContent = '相手: オンライン';
                
                if (!wasOnline && hasShownOnlineNotification) {
                    showPushNotification(
                        '💚 オンライン通知',
                        `${partnerRole === 'girlfriend' ? '彼女' : '彼氏'}がオンラインになりました！`
                    );
                }
                hasShownOnlineNotification = true;
            } else {
                dot.classList.remove('online');
                dot.classList.add('offline');
                text.textContent = '相手: オフライン';
            }
        }
    });
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (message) {
        push(ref(db, `${ROOM_ID}/messages`), {
            text: message,
            sender: userRole,
            timestamp: Date.now()
        });
        input.value = '';
    }
}

function sendAnxiety() {
    push(ref(db, `${ROOM_ID}/messages`), {
        text: '😰 不安を感じています',
        sender: userRole,
        type: 'anxiety',
        timestamp: Date.now()
    });
}

function sendCheck() {
    push(ref(db, `${ROOM_ID}/messages`), {
        text: '💚 大丈夫？',
        sender: userRole,
        type: 'check',
        timestamp: Date.now()
    });
}

function loadMessages() {
    onValue(ref(db, `${ROOM_ID}/messages`), (snapshot) => {
        const chatArea = document.getElementById('chatMessages');
        chatArea.innerHTML = '';
        if (snapshot.exists()) {
            const messages = [];
            snapshot.forEach((child) => {
                messages.push({ id: child.key, ...child.val() });
            });
            messages.sort((a, b) => a.timestamp - b.timestamp);
            messages.forEach(msg => displayMessage(msg));
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    });
}

let lastMessageTime = 0;

function displayMessage(msg) {
    const chatArea = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = msg.type === 'system' ? 'message system' : `message ${msg.sender}`;
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.text;
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(msg.timestamp);
    
    div.appendChild(content);
    div.appendChild(time);
    chatArea.appendChild(div);

    if (msg.sender !== userRole && msg.timestamp > lastMessageTime) {
        lastMessageTime = msg.timestamp;
        const partnerName = userRole === 'boyfriend' ? '彼女' : '彼氏';
        
        if (msg.type === 'anxiety') {
            showPushNotification(
                '⚠️ 緊急通知',
                `${partnerName}が不安を感じています！`
            );
        } else if (msg.type === 'check') {
            showPushNotification(
                '💚 気遣い通知',
                `${partnerName}が心配しています`
            );
        } else if (!msg.type) {
            showPushNotification(
                '💬 新しいメッセージ',
                msg.text
            );
        }
    }
}

function cleanOldMessages() {
    setInterval(() => {
        const oneDayAgo = Date.now() - 86400000;
        onValue(ref(db, `${ROOM_ID}/messages`), (snapshot) => {
            if (snapshot.exists()) {
                snapshot.forEach((child) => {
                    const msg = child.val();
                    if (msg.timestamp < oneDayAgo) {
                        remove(ref(db, `${ROOM_ID}/messages/${child.key}`));
                    }
                });
            }
        }, { onlyOnce: true });
    }, 60000);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
}

function formatTimeWithRelative(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) {
        return '今';
    } else if (minutes < 60) {
        return `${minutes}分前`;
    } else if (hours < 24) {
        return `${hours}時間前 (${formatTime(timestamp)})`;
    } else {
        return `${days}日前 (${formatTime(timestamp)})`;
    }
}

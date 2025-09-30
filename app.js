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
    sendBtn.

const socket = io();
let currentUser = { id: null, name: '', isHost: false };
let currentRoomCode = null;

// Элементы DOM
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const usernameInput = document.getElementById('username-input');
const joinInput = document.getElementById('room-code-join');
const btnJoinToggle = document.getElementById('btn-join-toggle');
const btnJoinAction = document.getElementById('btn-join-action');

// Переключение режима входа
function toggleJoinMode() {
    if (joinInput.style.display === 'none') {
        joinInput.style.display = 'block';
        btnJoinAction.style.display = 'inline-block';
        btnJoinToggle.innerText = 'Отмена';
        btnJoinToggle.style.background = '#fff';
    } else {
        joinInput.style.display = 'none';
        btnJoinAction.style.display = 'none';
        btnJoinToggle.innerText = 'У меня есть код';
        btnJoinToggle.style.background = '#ddd';
    }
}

// Создание комнаты
function createRoom() {
    const name = usernameInput.value.trim() || 'Аноним';
    if (!name) return alert('Введите имя!');
    socket.emit('create_room', { name });
}

// Вход в комнату
function joinRoom() {
    const name = usernameInput.value.trim() || 'Аноним';
    const code = joinInput.value.trim();
    if (!code) return alert('Введите код комнаты!');
    socket.emit('join_room', { code, name });
}

function leaveRoom() {
    location.reload();
}

// --- Socket Events ---

socket.on('room_created', ({ code, roomState, userId, userName }) => {
    initApp(code, userId, userName, true, roomState);
});

socket.on('room_joined', ({ code, roomState, userId, userName }) => {
    initApp(code, userId, userName, false, roomState);
});

socket.on('error_msg', (msg) => {
    alert(msg);
});

socket.on('user_added', ({ user }) => {
    addUserToUI(user);
});

socket.on('user_left', ({ userId }) => {
    removeUserFromUI(userId);
});

socket.on('host_changed', ({ newHostId }) => {
    if (newHostId === currentUser.id) {
        currentUser.isHost = true;
        updateHostControls();
        alert('Вы стали новым ведущим комнаты!');
    }
    updateUsersListRoles(newHostId);
});

socket.on('queue_update', (queue) => {
    renderQueue(queue);
    document.getElementById('queue-count').innerText = `(${queue.length})`;
});

socket.on('player_state', ({ status, currentTrack }) => {
    updatePlayerUI(status, currentTrack);
});

// --- Инициализация приложения ---

function initApp(code, userId, name, isHost, state) {
    currentUser = { id: userId, name, isHost };
    currentRoomCode = code;

    loginScreen.style.display = 'none';
    appScreen.style.display = 'block';

    document.getElementById('user-name-display').innerText = name;
    document.getElementById('room-display-code').innerText = `#${code}`;
    
    updateHostControls();
    
    // Рендер начального состояния
    document.getElementById('users-list').innerHTML = '';
    state.users.forEach(u => addUserToUI(u));
    renderQueue(state.queue);
    if (state.currentTrack) updatePlayerUI(state.status, state.currentTrack);
}

function updateHostControls() {
    const controls = document.querySelector('.controls-bar');
    const badge = document.getElementById('host-badge');
    
    if (currentUser.isHost) {
        controls.style.opacity = '1';
        controls.style.pointerEvents = 'all';
        badge.style.display = 'block';
    } else {
        controls.style.opacity = '0.5';
        controls.style.pointerEvents = 'none'; // Блокируем кнопки для гостей
        badge.style.display = 'none';
    }
}

// --- UI Функции ---

function addUserToUI(user) {
    const list = document.getElementById('users-list');
    const li = document.createElement('li');
    li.id = `user-${user.id}`;
    li.innerHTML = `
        <div class="avatar">${user.name[0].toUpperCase()}</div>
        <span>${user.name}</span>
        ${user.isHost ? '<span class="badge-host">HOST</span>' : ''}
    `;
    list.appendChild(li);
}

function removeUserFromUI(id) {
    const el = document.getElementById(`user-${id}`);
    if (el) el.remove();
}

function updateUsersListRoles(newHostId) {
    const list = document.getElementById('users-list');
    Array.from(list.children).forEach(li => {
        const badge = li.querySelector('.badge-host');
        if (li.id === `user-${newHostId}`) {
            if (!badge) li.innerHTML += ' <span class="badge-host">HOST</span>';
        } else {
            if (badge) badge.remove();
        }
    });
}

function renderQueue(queue) {
    const list = document.getElementById('queue-list');
    list.innerHTML = '';
    
    queue.forEach((track, index) => {
        const li = document.createElement('li');
        const coverUrl = track.coverUri ? `https://${track.coverUri.replace('%%', '100x100')}` : 'https://via.placeholder.com/100';
        
        li.innerHTML = `
            <img src="${coverUrl}" alt="cover">
            <div class="track-info">
                <div class="title">${track.title}</div>
                <div class="artist">${track.artists.map(a=>a.name).join(', ')}</div>
            </div>
            <div class="votes">
                <button onclick="vote('${track.id}', 1)">👍 ${track.score > 0 ? track.score : ''}</button>
                <button onclick="vote('${track.id}', -1)">👎</button>
            </div>
            ${currentUser.isHost ? `<button class="btn-del" onclick="removeTrack('${track.id}')">🗑</button>` : ''}
        `;
        list.appendChild(li);
    });
}

function updatePlayerUI(status, track) {
    const titleEl = document.getElementById('
// Подключение к Socket.io серверу
const API_URL = window.location.origin;
const socket = io(API_URL, {
  autoConnect: false,
  auth: { token: localStorage.getItem('jwt_token') },
});

const app = {
  state: {
    user: null,
    isHost: false,
    roomCode: null,
    roomId: null,
    users: [],
    queue: [],
    currentTrack: null,
    isPlaying: false,
    progress: 0,
    progressInterval: null,
    socketConnected: false,
    audio: null,
    currentProgressMs: 0,
  },

  // ==================== АВТОРИЗАЦИЯ ====================

  async checkAuthStatus() {
    const token = localStorage.getItem('jwt_token');
    const userData = localStorage.getItem('user_data');
    
    if (token && userData) {
      try {
        this.state.user = JSON.parse(userData);
        this.state.socketConnected = true;
        socket.auth.token = token;
        socket.connect();
        this.enterAppAfterLogin(this.state.user);
        return true;
      } catch (e) {
        console.error('Auth check error:', e);
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
      }
    }
    this.showLoginScreen();
    return false;
  },

  showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
  },

  initiateLogin() {
    window.location.href = `${API_URL}/auth/yandex`;
  },

  handleYandexCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const userParam = urlParams.get('user');

    console.log('📥 Frontend callback:', { hasToken: !!token, hasUser: !!userParam });

    if (token) {
      try {
        localStorage.setItem('jwt_token', token);
        const userData = JSON.parse(decodeURIComponent(userParam));
        localStorage.setItem('user_data', JSON.stringify(userData));

        console.log('✅ User data saved:', userData);

        this.state.user = userData;
        this.state.socketConnected = true;
        socket.auth.token = token;
        socket.connect();

        this.enterAppAfterLogin(userData);
        
        // Очищаем URL от параметров токена
        window.history.replaceState({}, document.title, window.location.pathname);
        
        console.log('✅ Callback processed successfully');
      } catch (err) {
        console.error('❌ Callback error:', err);
        alert('Ошибка при входе: ' + err.message);
        this.showLoginScreen();
      }
    } else {
      const error = urlParams.get('error') || 'Неизвестная ошибка';
      console.error('❌ Callback error:', error);
      alert(`Ошибка авторизации: ${error}`);
      this.showLoginScreen();
    }
  },

  enterAppAfterLogin(userData) {
    console.log('🚀 Entering app with user:', userData);

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    // Обновляем имя пользователя
    document.getElementById('display-username').innerText = userData.nickname || 'Пользователь';

    // Обновляем аватар если есть
    const userInfoEl = document.querySelector('.user-info');
    if (userData.avatar_url) {
      // Проверяем, есть ли уже аватар
      let avatarEl = document.getElementById('user-avatar');
      if (!avatarEl) {
        avatarEl = document.createElement('img');
        avatarEl.id = 'user-avatar';
        avatarEl.className = 'user-avatar';
        userInfoEl.insertBefore(avatarEl, userInfoEl.firstChild);
      }
      avatarEl.src = userData.avatar_url;
      avatarEl.alt = userData.nickname || 'User';
      avatarEl.style.display = 'block';
    }

    this.setupSocketListeners();

    // Автосоздание комнаты после входа
    console.log('🏠 Auto-creating room...');
    this.createRoom();
  },

  logout() {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_data');
    socket.disconnect();
    window.location.reload();
  },

  // ==================== СОЗДАНИЕ/ВХОД В КОМНАТУ ====================

  toggleJoinMode() {
    const input = document.getElementById('room-code-input');
    const btnToggle = document.getElementById('btn-create-or-join');

    if (input.classList.contains('hidden')) {
      input.classList.remove('hidden');
      btnToggle.innerText = 'Отмена';
    } else {
      input.classList.add('hidden');
      btnToggle.innerText = 'Создать комнату или войти по коду';
    }
  },

  async createRoom() {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
      alert('Вы не авторизованы. Войдите через Яндекс.');
      this.showLoginScreen();
      return;
    }

    console.log('🏠 Creating room...');

    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📥 Room creation response status:', res.status);

      if (!res.ok) {
        const error = await res.json();
        console.error('❌ Room creation error:', error);
        throw new Error(error.error || 'Не удалось создать комнату');
      }

      const data = await res.json();
      console.log('✅ Room created:', data.room);
      
      this.initRoom(data.room);
    } catch (err) {
      console.error('❌ Create room error:', err);
      this.showToast(err.message || 'Не удалось создать комнату');
    }
  },

  async joinRoom() {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
      alert('Вы не авторизованы. Войдите через Яндекс.');
      this.showLoginScreen();
      return;
    }

    const code = document.getElementById('room-code-input-field').value.trim();
    if (!code) {
      alert('Введите код комнаты!');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/rooms/${code}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Не удалось войти в комнату');
      }

      const data = await res.json();
      this.initRoom(data.room);
    } catch (err) {
      console.error('Join room error:', err);
      this.showToast(err.message || 'Не удалось войти в комнату');
    }
  },

  initRoom(room) {
    this.state.roomId = room.id;
    this.state.roomCode = room.code;
    this.state.isHost = (room.host_id === this.state.user.id);
    this.state.users = room.users || [];
    this.state.queue = room.queue || [];
    this.state.currentTrack = room.currentTrack;

    // Обновляем UI
    document.getElementById('display-room-code').innerText = `#${this.state.roomCode}`;
    
    if (this.state.isHost) {
      document.getElementById('is-host-badge').classList.remove('hidden');
      document.getElementById('host-status-msg').innerText = 'Режим ведущего: управление активно';
      document.getElementById('host-status-msg').classList.add('host-active');
    } else {
      document.getElementById('host-status-msg').innerText = 'Режим участника: ожидайте действий ведущего';
      document.getElementById('host-status-msg').classList.remove('host-active');
    }

    // Присоединяемся к комнате через Socket.io
    socket.emit('join_room', { roomId: this.state.roomId, userId: this.state.user.id });

    this.renderUsers();
    this.renderQueue();
    this.updatePlayerUI();
  },

  // ==================== SOCKET.IO СОБЫТИЯ ====================

  setupSocketListeners() {
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      this.state.socketConnected = true;
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.state.socketConnected = false;
    });

    socket.on('user_joined', ({ userId, socketId }) => {
      console.log('User joined:', userId);
      this.refreshRoomState();
    });

    socket.on('queue_update', ({ queue }) => {
      console.log('Queue updated');
      this.state.queue = queue;
      this.renderQueue();
    });

    socket.on('player_state', ({ status, currentTrack, timestamp, progressMs }) => {
      console.log('Player state updated:', status, 'progress:', progressMs);
      if (currentTrack) {
        this.state.currentTrack = currentTrack;
        this.state.isPlaying = status === 'playing';
        if (progressMs !== undefined) {
          this.state.currentProgressMs = progressMs;
        }
        this.updatePlayerUI();
      }
    });

    socket.on('track_changed', ({ currentTrack, queue, status }) => {
      console.log('Track changed');
      this.state.currentTrack = currentTrack;
      this.state.queue = queue || [];
      this.state.isPlaying = status === 'playing';
      this.state.currentProgressMs = 0; // Сброс прогресса при новом треке
      this.renderQueue();
      this.updatePlayerUI();

      if (currentTrack) {
        this.showToast(`Сейчас играет: ${currentTrack.title}`);
      }
    });

    socket.on('error_msg', ({ message }) => {
      this.showToast(message);
    });
  },

  async refreshRoomState() {
    if (!this.state.roomId) return;
    
    const token = localStorage.getItem('jwt_token');
    try {
      const res = await fetch(`${API_URL}/rooms/${this.state.roomId}/state`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        this.state.users = data.room.users || [];
        this.state.queue = data.room.queue || [];
        this.state.currentTrack = data.room.currentTrack;
        this.renderUsers();
        this.renderQueue();
        this.updatePlayerUI();
      }
    } catch (err) {
      console.error('Refresh room state error:', err);
    }
  },

  // ==================== ПОИСК ТРЕКОВ ====================

  async searchTracks() {
    const query = document.getElementById('search-query').value.trim();
    const resultsContainer = document.getElementById('search-results');
    const loadingEl = document.getElementById('search-loading');

    console.log('🔍 Frontend search triggered:', { query, queryLength: query?.length });

    if (!query || query.length < 2) {
      this.showToast('Введите минимум 2 символа для поиска');
      return;
    }

    const token = localStorage.getItem('jwt_token');
    console.log('🔑 Token exists:', !!token);
    
    if (!token) {
      alert('Вы не авторизованы. Войдите через Яндекс.');
      this.showLoginScreen();
      return;
    }

    loadingEl.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    try {
      const url = `${API_URL}/tracks/search?q=${encodeURIComponent(query)}`;
      console.log('📡 Fetch URL:', url);
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📥 Response status:', res.status);

      if (!res.ok) {
        const error = await res.json();
        console.error('❌ Search error response:', error);
        throw new Error(error.error || 'Ошибка при поиске');
      }

      const data = await res.json();
      console.log('✅ Search response:', { total: data.total, tracks: data.tracks.length });

      if (data.tracks.length === 0) {
        resultsContainer.innerHTML = '<li style="padding:10px;color:#999;">Ничего не найдено 😔</li>';
        return;
      }

      data.tracks.forEach(track => {
        const li = document.createElement('li');
        li.className = 'track-item';
        const coverUrl = track.cover_url || 'https://via.placeholder.com/50';

        li.innerHTML = `
          <img src="${coverUrl}" alt="cover" class="track-cover">
          <div class="track-info">
            <div class="track-name">${this.escapeHtml(track.title)}</div>
            <div class="track-artist-sm">${this.escapeHtml(track.artist)}</div>
          </div>
          <button class="btn btn-small btn-primary" onclick="app.addToQueue('${track.yandex_track_id}')">
            + В очередь
          </button>
        `;
        resultsContainer.appendChild(li);
      });
    } catch (err) {
      console.error('❌ Search error:', err);
      resultsContainer.innerHTML = `<li style="padding:10px;color:red;">Ошибка: ${err.message}</li>`;
    } finally {
      loadingEl.classList.add('hidden');
    }
  },

  // ==================== ДОБАВЛЕНИЕ В ОЧЕРЕДЬ ====================

  async addToQueue(yandexTrackId) {
    const token = localStorage.getItem('jwt_token');
    if (!token || !this.state.roomId) {
      this.showToast('Ошибка: нет комнаты или авторизации');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/tracks/${yandexTrackId}/add-to-room/${this.state.roomId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const error = await res.json();
        if (error.error && error.error.includes('уже есть')) {
          this.showToast('Этот трек уже есть в очереди');
          return;
        }
        throw new Error(error.error || 'Ошибка при добавлении');
      }

      const data = await res.json();
      this.state.queue = data.queue;
      this.renderQueue();
      this.showToast('Трек добавлен в очередь');
      
      // Очищаем поиск
      document.getElementById('search-query').value = '';
      document.getElementById('search-results').innerHTML = '';
    } catch (err) {
      console.error('Add to queue error:', err);
      this.showToast(err.message || 'Не удалось добавить трек');
    }
  },

  // ==================== ГОЛОСОВАНИЕ ====================

  async vote(roomTrackId, value) {
    const token = localStorage.getItem('jwt_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/tracks/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomTrackId,
          value,
          userId: this.state.user.id
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Ошибка при голосовании');
      }

      const data = await res.json();
      this.state.queue = data.queue;
      this.renderQueue();
    } catch (err) {
      console.error('Vote error:', err);
      this.showToast(err.message);
    }
  },

  // ==================== ПЛЕЕР ====================

  togglePlay() {
    if (!this.state.isHost) {
      this.showToast('Только ведущий может управлять плеером!');
      return;
    }

    this.state.isPlaying = !this.state.isPlaying;

    // Отправляем состояние через Socket.io
    socket.emit('player_state', {
      roomId: this.state.roomId,
      status: this.state.isPlaying ? 'playing' : 'paused',
      currentTrack: this.state.currentTrack,
      timestamp: Date.now(),
      progressMs: this.state.currentProgressMs,
    });

    this.updatePlayerUI();
  },

  async nextTrack() {
    if (!this.state.isHost) {
      this.showToast('Только ведущий может переключать треки!');
      return;
    }

    const token = localStorage.getItem('jwt_token');
    try {
      const res = await fetch(`${API_URL}/rooms/${this.state.roomId}/next-track`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Ошибка при переключении');
      }

      const data = await res.json();
      if (data.currentTrack) {
        this.state.currentTrack = data.currentTrack;
        this.state.queue = data.queue || [];
        this.state.isPlaying = true;
        this.state.currentProgressMs = 0; // Сброс прогресса при новом треке
        this.renderQueue();
        this.updatePlayerUI();
        this.showToast(`Сейчас играет: ${data.currentTrack.title}`);
      } else {
        this.state.currentTrack = null;
        this.state.isPlaying = false;
        this.updatePlayerUI();
        this.showToast('Очередь пуста');
      }

      // Уведомляем участников через Socket.io
      socket.emit('next_track', { roomId: this.state.roomId });
    } catch (err) {
      console.error('Next track error:', err);
      this.showToast(err.message);
    }
  },

  previousTrack() {
    this.showToast('Функция в разработке');
  },

  async saveCurrentTrack() {
    if (!this.state.currentTrack) return;

    const token = localStorage.getItem('jwt_token');
    const yandexId = this.state.currentTrack.yandex_track_id;

    try {
      const res = await fetch(`${API_URL}/tracks/${yandexId}/save`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Ошибка при сохранении');
      }

      this.showToast('Трек сохранён в плейлист!');
    } catch (err) {
      console.error('Save track error:', err);
      this.showToast(err.message || 'Не удалось сохранить трек');
    }
  },

  updatePlayerUI() {
    const titleEl = document.getElementById('player-title');
    const artistEl = document.getElementById('player-artist');
    const coverEl = document.getElementById('player-cover');
    const playBtn = document.getElementById('btn-play-pause');
    const saveBtn = document.getElementById('btn-save-track');

    if (this.state.currentTrack) {
      titleEl.innerText = this.state.currentTrack.title;
      artistEl.innerText = this.state.currentTrack.artist;
      coverEl.src = this.state.currentTrack.cover_url || 'https://via.placeholder.com/300';
      saveBtn.style.display = 'inline-block';

      // Обновляем длительность
      const duration = this.state.currentTrack.duration_ms || 0;
      document.getElementById('duration').innerText = this.formatTime(duration);
    } else {
      titleEl.innerText = 'Ожидание...';
      artistEl.innerText = 'Очередь пуста';
      coverEl.src = 'https://via.placeholder.com/300/cccccc/969696?text=Music';
      saveBtn.style.display = 'none';
      document.getElementById('duration').innerText = '0:00';
    }

    playBtn.innerText = this.state.isPlaying ? '⏸ Pause' : '▶ Play';

    // Обновляем прогресс бар
    if (this.state.isPlaying && this.state.currentTrack) {
      this.startProgress(this.state.currentProgressMs);
    } else {
      // При паузе не сбрасываем прогресс, просто останавливаем интервал
      this.stopProgress();
    }
  },

  startProgress(startFromMs = 0) {
    this.stopProgress();
    const startTime = Date.now() - startFromMs;
    const duration = this.state.currentTrack?.duration_ms || 0;

    this.state.progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      this.state.currentProgressMs = elapsed;
      const progress = Math.min((elapsed / duration) * 100, 100);

      document.getElementById('progress-fill').style.width = `${progress}%`;
      document.getElementById('current-time').innerText = this.formatTime(elapsed);

      if (progress >= 100) {
        this.stopProgress();
        this.state.currentProgressMs = 0;
      }
    }, 1000);
  },

  stopProgress() {
    if (this.state.progressInterval) {
      clearInterval(this.state.progressInterval);
      this.state.progressInterval = null;
    }
  },

  resetProgress() {
    this.stopProgress();
    this.state.currentProgressMs = 0;
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('current-time').innerText = '0:00';
  },

  // ==================== ОТРИСОВКА ====================

  renderUsers() {
    const list = document.getElementById('users-list');
    list.innerHTML = '';
    
    this.state.users.forEach(u => {
      const li = document.createElement('li');
      li.className = 'user-item';
      li.innerHTML = `
        <div class="avatar">${(u.name || 'U')[0].toUpperCase()}</div>
        <span>${this.escapeHtml(u.name || 'Аноним')}</span>
        ${u.isHost ? '<span class="host-tag">HOST</span>' : ''}
      `;
      list.appendChild(li);
    });
  },

  renderQueue() {
    const list = document.getElementById('queue-list');
    document.getElementById('queue-count').innerText = `(${this.state.queue.length})`;
    
    if (this.state.queue.length === 0) {
      list.innerHTML = '<li style="text-align:center;color:#999;padding:20px;">Очередь пуста</li>';
      return;
    }

    list.innerHTML = '';
    this.state.queue.forEach((track, index) => {
      const li = document.createElement('li');
      li.className = 'track-item';
      const coverUrl = track.cover_url || 'https://via.placeholder.com/50';
      const isPlaying = track.status === 'playing';

      li.innerHTML = `
        <img src="${coverUrl}" alt="cover" class="track-cover">
        <div class="track-info">
          <div class="track-name ${isPlaying ? 'playing' : ''}">
            ${isPlaying ? '🎵 ' : ''}${this.escapeHtml(track.title)}
          </div>
          <div class="track-artist-sm">${this.escapeHtml(track.artist)}</div>
        </div>
        <div class="track-actions">
          <button class="vote-btn" onclick="app.vote(${track.room_track_id}, 1)">👍</button>
          <span class="score">${track.score || 0}</span>
          <button class="vote-btn" onclick="app.vote(${track.room_track_id}, -1)">👎</button>
          ${this.state.isHost ? `<button class="btn-del" onclick="app.removeTrack(${track.room_track_id})">🗑</button>` : ''}
        </div>
      `;
      list.appendChild(li);
    });
  },

  async removeTrack(roomTrackId) {
    if (!this.state.isHost) {
      this.showToast('Только ведущий может удалять треки!');
      return;
    }

    const token = localStorage.getItem('jwt_token');
    try {
      const res = await fetch(`${API_URL}/rooms/${this.state.roomId}/tracks/${roomTrackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Ошибка при удалении');
      }

      const data = await res.json();
      this.state.queue = data.queue;
      this.renderQueue();
      this.showToast('Трек удалён из очереди');
    } catch (err) {
      console.error('Remove track error:', err);
      this.showToast(err.message);
    }
  },

  // ==================== УТИЛИТЫ ====================

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname;

  // Обработка callback после авторизации
  if (pathname === '/callback' || urlParams.has('token') || urlParams.has('error')) {
    app.handleYandexCallback();
  } else {
    app.checkAuthStatus();
  }

  // Обработчики кнопок
  document.getElementById('btn-login-yandex')?.addEventListener('click', () => app.initiateLogin());
  document.getElementById('btn-join')?.addEventListener('click', () => app.joinRoom());
  
  // Обработчик кнопки поиска
  const searchBtn = document.querySelector('.search-container .btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      console.log('🔍 Search button clicked');
      app.searchTracks();
    });
  }

  // Поиск по Enter
  document.getElementById('search-query')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') app.searchTracks();
  });
  
  console.log('✅ App initialized, pathname:', window.location.pathname);
});

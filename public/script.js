// ===== STATE =====
const state = {
  socket: null, username: '', roomId: '', myId: '', isAdmin: false,
  localStream: null, peers: {}, micEnabled: true, camEnabled: true,
  screenSharing: false, currentGame: null, gameState: null, connected: false,
  typingTimeout: null, isTyping: false,
};

// ===== DOM REFS =====
const $ = (id) => document.getElementById(id);
const LS = (sel) => document.querySelector(sel);
const LSA = (sel) => document.querySelectorAll(sel);

const loginScreen = $('login-screen'), appScreen = $('app-screen');
const loginMenu = $('login-menu'), createForm = $('create-form'), joinForm = $('join-form');
const createUsernameInput = $('create-username-input'), joinUsernameInput = $('join-username-input');
const roomCodeInput = $('room-code-input'), createRoomBtn = $('create-room-btn'), joinRoomBtn = $('join-room-btn');
const menuCreateBtn = $('menu-create-btn'), menuJoinBtn = $('menu-join-btn');
const backFromCreate = $('back-from-create'), backFromJoin = $('back-from-join');
const localVideo = $('local-video'), remoteVideos = $('remote-videos');
const roomCodeDisplay = $('room-code-display'), copyRoomBtn = $('copy-room-btn');
const usersList = $('users-list'), userCount = $('user-count');
const chatMessages = $('chat-messages'), chatInput = $('chat-input'), chatSendBtn = $('chat-send-btn');
const emojiBtn = $('emoji-btn'), emojiPicker = $('emoji-picker');
const typingIndicator = $('typing-indicator'), typingText = $('typing-text');
const gameMenu = $('game-menu'), gameScreen = $('game-screen');
const gameArea = $('game-area'), gameScores = $('game-scores'), gameTitle = $('game-title');
const gameTimer = $('game-timer'), timerValue = $('timer-value');
const localUsernameLabel = $('local-username-label');
const connStatus = $('connection-status'), connText = $('conn-text');
const toastContainer = $('toast-container');

// ===== TOAST =====
function showToast(text, type = 'info', duration = 3000) {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info} toast-icon"></i><span>${text}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px)'; toast.style.transition = 'all 0.3s ease'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ===== CONNECTION STATUS =====
function setConnStatus(status, text) {
  connStatus.className = `conn-status visible ${status}`;
  connText.textContent = text;
}

// ===== SOCKET.IO =====
function connectAndJoin(type, username, roomCode) {
  if (state.socket && state.socket.connected) state.socket.disconnect();

  state.socket = io({ reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000 });
  state.username = username;
  setConnStatus('reconnecting', 'Bağlanıyor...');

  state.socket.on('connect', () => {
    state.myId = state.socket.id; state.connected = true;
    setConnStatus('connected', 'Bağlı');
    console.log('✅ Bağlandı:', state.myId);

    if (type === 'create') state.socket.emit('create-room', username, handleJoinResponse);
    else state.socket.emit('join-room', { roomId: roomCode, username }, handleJoinResponse);
  });

  state.socket.on('connect_error', (err) => {
    console.error('❌ Bağlantı hatası:', err.message);
    setConnStatus('disconnected', 'Bağlantı hatası!');
    showToast('Sunucuya bağlanılamadı!', 'error');
    resetButtons();
  });

  state.socket.on('disconnect', () => {
    state.connected = false;
    setConnStatus('disconnected', 'Bağlantı koptu');
  });

  state.socket.on('reconnect', () => {
    setConnStatus('connected', 'Yeniden bağlandı');
    showToast('Yeniden bağlanıldı!', 'success');
  });

  // Room events
  state.socket.on('room-users', (users) => { updateUsersList(users); updateUserCount(users.length); });

  state.socket.on('user-joined', ({ user, users }) => {
    updateUsersList(users); updateUserCount(users.length);
    showToast(`${user.username} katıldı!`, 'info');
    setupWebRTC(users);
  });

  state.socket.on('user-left', ({ users, leftUser }) => {
    updateUsersList(users); updateUserCount(users.length);
    const me = users.find(u => u.id === state.myId);
    if (me) state.isAdmin = me.isAdmin;
    if (leftUser) {
      if (state.peers[leftUser.id]) { state.peers[leftUser.id].close(); delete state.peers[leftUser.id]; }
      removeRemoteVideo(leftUser.id);
      showToast(`${leftUser.username} ayrıldı`, 'info');
    }
  });

  // WebRTC
  state.socket.on('offer', async ({ from, offer }) => {
    try {
      const pc = createPeerConnection(from, false);
      state.peers[from] = pc;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      state.socket.emit('answer', { to: from, answer: pc.localDescription });
    } catch (err) { console.error('Offer hatası:', err); }
  });

  state.socket.on('answer', async ({ from, answer }) => {
    const pc = state.peers[from];
    if (pc && pc.currentRemoteDescription === null) {
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); } catch (err) { console.error('Answer hatası:', err); }
    }
  });

  state.socket.on('ice-candidate', async ({ from, candidate }) => {
    const pc = state.peers[from];
    if (pc && candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {} }
  });

  // Chat
  state.socket.on('chat-message', ({ userId, username, color, message, type, timestamp }) => {
    addChatMessage(userId, username, color, message, type, timestamp);
  });

  state.socket.on('typing-start', ({ userId, username }) => {
    if (userId !== state.myId) {
      typingText.textContent = `${username} yazıyor...`;
      typingIndicator.classList.remove('hidden');
    }
  });

  state.socket.on('typing-stop', ({ userId }) => {
    if (userId !== state.myId) typingIndicator.classList.add('hidden');
  });

  // Games
  state.socket.on('game-started', (data) => { if (data.type === 'riddle') startRiddleGame(data); });
  state.socket.on('correct-answer', ({ username, scores, bonus }) => {
    showRiddleFeedback(`${username} doğru bildi! ${bonus > 0 ? `(+${10 + bonus} puan 🎯)` : '(+10 puan)'}`, 'correct');
    updateGameScores(scores);
  });
  state.socket.on('next-riddle', ({ currentRiddle, currentIndex, scores }) => showNextRiddle(currentRiddle, currentIndex, scores));
  state.socket.on('time-up-riddle', ({ answer }) => showRiddleFeedback(`⏰ Süre doldu! Cevap: ${answer}`, 'info'));
  state.socket.on('game-ended', ({ type, scores, winner }) => showGameEnd(type, scores, winner));

  state.socket.on('word-round-start', (data) => startWordRound(data));
  state.socket.on('word-guessed', ({ username, word, scores }) => {
    showWordFeedback(`${username} kelimeyi buldu: ${word}`, 'correct');
    updateGameScores(scores);
  });
  state.socket.on('word-hint-revealed', ({ hintLevel }) => showWordHintLevel(hintLevel));
  state.socket.on('time-up-word', ({ word }) => showWordFeedback(`⏰ Süre doldu! Kelime: ${word}`, 'info'));

  state.socket.on('trivia-question', (data) => showTriviaQuestion(data));
  state.socket.on('trivia-answer-result', ({ userId, username, isCorrect, correctAnswer, scores }) => showTriviaResult(userId, username, isCorrect, correctAnswer, scores));
  state.socket.on('time-up-trivia', ({ correctAnswer }) => {
    const letters = ['A', 'B', 'C', 'D'];
    const fb = $('trivia-feedback');
    if (fb) fb.innerHTML = `<div class="riddle-feedback info">⏰ Süre doldu! Doğru cevap: ${letters[correctAnswer]}</div>`;
  });

  // Timer
  state.socket.on('timer-tick', ({ timer }) => {
    if (timerValue) timerValue.textContent = timer;
    if (gameTimer) {
      gameTimer.classList.remove('hidden');
      gameTimer.classList.toggle('urgent', timer <= 5);
    }
  });
}

function handleJoinResponse(response) {
  resetButtons();
  if (response.success) {
    state.roomId = response.roomId;
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    roomCodeDisplay.textContent = `#${response.roomId}`;
    localUsernameLabel.textContent = state.username;
    setConnStatus('connected', 'Bağlı');

    state.socket.emit('get-users', (users) => {
      updateUsersList(users); updateUserCount(users.length);
      const me = users.find(u => u.id === state.myId);
      if (me) state.isAdmin = me.isAdmin;
      setupWebRTC(users);
    });
    showToast('Bağlantı başarılı! 🎉', 'success');
  } else {
    setConnStatus('disconnected', 'Hata!');
    showToast(response.error || 'Bir hata oluştu!', 'error');
    alert(response.error || 'Bir hata oluştu!');
  }
}

function resetButtons() {
  createRoomBtn.disabled = false; createRoomBtn.innerHTML = '<i class="fas fa-door-open"></i> Oda Kur';
  joinRoomBtn.disabled = false; joinRoomBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Katıl';
}

// ===== WEBRTC =====
async function setupWebRTC(users) {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: true,
    });
    localVideo.srcObject = state.localStream;
  } catch (err) {
    console.error('Kamera/mikrofon hatası:', err);
    showToast('Kamera veya mikrofona erişilemedi!', 'error');
    return;
  }
  users.forEach(user => {
    if (user.id !== state.myId && !state.peers[user.id]) {
      state.peers[user.id] = createPeerConnection(user.id, true);
    }
  });
}

function createPeerConnection(targetId, initiator) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => pc.addTrack(track, state.localStream));
  }

  pc.onicecandidate = (e) => {
    if (e.candidate && state.socket?.connected) state.socket.emit('ice-candidate', { to: targetId, candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    let videoEl = document.getElementById(`remote-video-${targetId}`);
    if (!videoEl) videoEl = createRemoteVideo(targetId);
    videoEl.srcObject = e.streams[0];
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      pc.close(); delete state.peers[targetId]; removeRemoteVideo(targetId);
    }
  };

  if (initiator) {
    setTimeout(() => {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => { if (state.socket?.connected) state.socket.emit('offer', { to: targetId, offer: pc.localDescription }); })
        .catch(err => console.error('Offer hatası:', err));
    }, 500);
  }
  return pc;
}

function createRemoteVideo(userId) {
  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `remote-container-${userId}`;
  const video = document.createElement('video');
  video.id = `remote-video-${userId}`; video.autoplay = true; video.playsInline = true;
  container.appendChild(video);
  const label = document.createElement('div');
  label.className = 'video-label';
  label.innerHTML = `<i class="fas fa-user"></i><span id="remote-name-${userId}">Yükleniyor...</span>`;
  container.appendChild(label);
  remoteVideos.appendChild(container);
  return video;
}

function removeRemoteVideo(userId) {
  const el = document.getElementById(`remote-container-${userId}`);
  if (el) el.remove();
}

// ===== MEDIA CONTROLS =====
function toggleMic() {
  if (!state.localStream) return;
  state.micEnabled = !state.micEnabled;
  state.localStream.getAudioTracks().forEach(t => t.enabled = state.micEnabled);
  const btn = $('toggle-mic-btn');
  btn.classList.toggle('active', state.micEnabled);
  btn.classList.toggle('muted', !state.micEnabled);
  btn.innerHTML = state.micEnabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
}

function toggleCam() {
  if (!state.localStream) return;
  state.camEnabled = !state.camEnabled;
  state.localStream.getVideoTracks().forEach(t => t.enabled = state.camEnabled);
  const btn = $('toggle-cam-btn');
  btn.classList.toggle('active', state.camEnabled);
  btn.classList.toggle('muted', !state.camEnabled);
  btn.innerHTML = state.camEnabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
}

async function toggleScreenShare() {
  if (state.screenSharing) {
    const videoTrack = state.localStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.stop();
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: true,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const audioTrack = newStream.getAudioTracks()[0];
      Object.values(state.peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      });
      state.localStream.getVideoTracks().forEach(t => t.stop());
      state.localStream.removeTrack(state.localStream.getVideoTracks()[0]);
      state.localStream.addTrack(newVideoTrack);
      if (audioTrack) state.localStream.addTrack(audioTrack);
      localVideo.srcObject = state.localStream;
    } catch (err) { console.error('Kamera geri alma hatası:', err); }
    state.screenSharing = false;
    $('screen-share-btn').classList.remove('active');
    $('screen-share-btn').innerHTML = '<i class="fas fa-desktop"></i>';
  } else {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.onended = () => toggleScreenShare();
      Object.values(state.peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });
      state.localStream.getVideoTracks().forEach(t => t.stop());
      state.localStream.removeTrack(state.localStream.getVideoTracks()[0]);
      state.localStream.addTrack(screenTrack);
      localVideo.srcObject = state.localStream;
      state.screenSharing = true;
      $('screen-share-btn').classList.add('active');
      $('screen-share-btn').innerHTML = '<i class="fas fa-stop-screen-share"></i>';
    } catch (err) { console.error('Ekran paylaşımı hatası:', err); }
  }
}

// ===== UI =====
function updateUsersList(users) {
  usersList.innerHTML = '';
  users.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-item';
    const initial = user.username.charAt(0).toUpperCase();
    const color = user.color || '#25d366';
    div.innerHTML = `
      <div class="user-avatar" style="background:${color}">${initial}</div>
      <div class="user-info">
        <div class="user-name">${escHtml(user.username)} ${user.id === state.myId ? '(Ben)' : ''}</div>
        <div class="user-status">${user.id === state.myId ? 'Bağlı' : 'Çevrimiçi'}</div>
      </div>
      ${user.isAdmin ? '<span class="user-badge admin">Admin</span>' : ''}
    `;
    usersList.appendChild(div);
    const nameLabel = document.getElementById(`remote-name-${user.id}`);
    if (nameLabel) nameLabel.textContent = user.username;
  });
}

function updateUserCount(count) { userCount.textContent = count; }

function addChatMessage(userId, username, color, message, type, timestamp) {
  const welcome = LS('.chat-welcome');
  if (welcome) welcome.remove();
  
  const div = document.createElement('div');
  div.className = `chat-message ${userId === state.myId ? 'own' : 'other'}`;
  const time = timestamp ? new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
  const userColor = color || (userId === state.myId ? 'var(--accent)' : 'var(--text-secondary)');
  
  div.innerHTML = `
    <div class="msg-user" style="color:${userColor}">${escHtml(username)}</div>
    <div class="msg-text">${escHtml(message)}</div>
    <div class="msg-time">${time}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ===== TAB SWITCHING =====
function switchTab(tabName) {
  LSA('.panel-tab').forEach(t => t.classList.add('hidden'));
  LSA('.icon-btn').forEach(b => b.classList.remove('active'));
  const tab = $({ users: 'users-tab', chat: 'chat-tab', games: 'games-tab' }[tabName]);
  if (tab) tab.classList.remove('hidden');
  const btn = $({ users: 'toggle-users-btn', chat: 'toggle-chat-btn', games: 'toggle-games-btn' }[tabName]);
  if (btn) btn.classList.add('active');
}

// ===== GAMES =====

// --- RIDDLE ---
function startRiddleGame(data) {
  state.currentGame = 'riddle';
  gameMenu.classList.add('hidden'); gameScreen.classList.remove('hidden');
  gameTitle.textContent = '🎯 Bilmece';
  showNextRiddle(data.currentRiddle, data.currentIndex, data.scores);
}

function showNextRiddle(riddle, index, scores) {
  gameArea.innerHTML = `
    <div class="riddle-container">
      <div class="riddle-progress">Soru ${index + 1} / ${riddle.totalRiddles || '?'}</div>
      <div class="riddle-question">${escHtml(riddle.question)}</div>
      <div class="riddle-input-group">
        <input type="text" id="riddle-answer-input" placeholder="Cevabın ne?" maxlength="50" autocomplete="off">
        <button id="riddle-submit-btn"><i class="fas fa-paper-plane"></i></button>
      </div>
      <div id="riddle-feedback"></div>
    </div>
  `;
  updateGameScores(scores);
  $('riddle-submit-btn').addEventListener('click', submitRiddleAnswer);
  $('riddle-answer-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') submitRiddleAnswer(); });
  setTimeout(() => { const inp = $('riddle-answer-input'); if (inp) inp.focus(); }, 100);
}

function submitRiddleAnswer() {
  const input = $('riddle-answer-input');
  if (!input) return;
  const answer = input.value.trim();
  if (!answer) return;
  state.socket.emit('riddle-answer', { answer });
  input.value = ''; input.focus();
}

function showRiddleFeedback(text, type) {
  const fb = $('riddle-feedback');
  if (fb) fb.innerHTML = `<div class="riddle-feedback ${type}">${text}</div>`;
}

// --- WORD ---
function startWordRound(data) {
  const { drawerId, drawerUsername, word, hint, currentIndex, totalWords, scores, timer } = data;
  state.currentGame = 'word';
  gameMenu.classList.add('hidden'); gameScreen.classList.remove('hidden');
  gameTitle.textContent = '📝 Kelime Tahmin';
  
  const isDrawer = drawerId === state.myId;
  const wordBlanks = word.split('').map(() => '_').join(' ');
  
  gameArea.innerHTML = `
    <div class="word-container">
      <div class="riddle-progress">Tur ${currentIndex + 1} / ${totalWords}</div>
      <div class="word-drawer-info">
        ${isDrawer ? '🎤 Sen anlatıyorsun!' : `<strong>${escHtml(drawerUsername)}</strong> anlatıyor...`}
      </div>
      <div class="word-hint-box" id="word-hint-box">
        ${isDrawer ? `<strong>Kelime:</strong> ${escHtml(word)}` : `💡 İpucu: ${escHtml(hint)}`}
      </div>
      ${!isDrawer ? `
        <div class="word-blanks">${wordBlanks}</div>
        <div class="word-input-group">
          <input type="text" id="word-guess-input" placeholder="Kelimeyi tahmin et..." maxlength="30" autocomplete="off">
          <button id="word-guess-btn"><i class="fas fa-paper-plane"></i></button>
        </div>
        <div id="word-feedback"></div>
      ` : `
        <div id="word-feedback"></div>
        <button id="word-next-btn" class="btn-primary create-btn mt-8"><i class="fas fa-arrow-right"></i> Sonraki Kelime</button>
      `}
    </div>
  `;
  updateGameScores(scores);
  
  if (!isDrawer) {
    $('word-guess-btn').addEventListener('click', submitWordGuess);
    $('word-guess-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') submitWordGuess(); });
    setTimeout(() => { const inp = $('word-guess-input'); if (inp) inp.focus(); }, 100);
  } else {
    $('word-next-btn').addEventListener('click', () => state.socket.emit('next-word'));
  }
}

function submitWordGuess() {
  const input = $('word-guess-input');
  if (!input) return;
  const guess = input.value.trim();
  if (!guess) return;
  state.socket.emit('word-guess', { guess });
  input.value = ''; input.focus();
}

function showWordFeedback(text, type) {
  const fb = $('word-feedback');
  if (fb) fb.innerHTML = `<div class="riddle-feedback ${type}">${text}</div>`;
}

function showWordHintLevel(level) {
  const box = $('word-hint-box');
  if (box) box.innerHTML += `<br><small class="text-muted">⭐ İpucu seviyesi: ${'⭐'.repeat(level)}</small>`;
}

// --- TRIVIA ---
function showTriviaQuestion(data) {
  const { question, currentIndex, totalQuestions, scores, timer } = data;
  state.currentGame = 'trivia';
  gameMenu.classList.add('hidden'); gameScreen.classList.remove('hidden');
  gameTitle.textContent = '🧠 Bilgi Yarışması';
  
  const letters = ['A', 'B', 'C', 'D'];
  
  gameArea.innerHTML = `
    <div class="trivia-container">
      <div class="trivia-progress">Soru ${currentIndex + 1} / ${totalQuestions}</div>
      <div class="trivia-question">${escHtml(question.question)}</div>
      <div class="trivia-options" id="trivia-options">
        ${question.options.map((opt, i) => `
          <div class="trivia-option" data-index="${i}">
            <strong>${letters[i]})</strong> ${escHtml(opt)}
          </div>
        `).join('')}
      </div>
      <div id="trivia-feedback"></div>
    </div>
  `;
  updateGameScores(scores);
  
  LSA('.trivia-option').forEach(el => {
    el.addEventListener('click', () => {
      const index = parseInt(el.dataset.index);
      LSA('.trivia-option').forEach(e => { e.style.pointerEvents = 'none'; if (parseInt(e.dataset.index) === index) e.classList.add('selected'); });
      state.socket.emit('trivia-answer', { answerIndex: index });
    });
  });
}

function showTriviaResult(userId, username, isCorrect, correctAnswer, scores) {
  const letters = ['A', 'B', 'C', 'D'];
  LSA('.trivia-option').forEach(el => { if (parseInt(el.dataset.index) === correctAnswer) el.classList.add('correct'); });
  const fb = $('trivia-feedback');
  if (fb) fb.innerHTML = `<div class="riddle-feedback ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? `${escHtml(username)} doğru bildi! (+10 puan)` : `${escHtml(username)} bilemedi. Doğru: ${letters[correctAnswer]}`}</div>`;
  updateGameScores(scores);
}

// --- COMMON ---
function updateGameScores(scores) {
  const container = $('game-scores');
  if (!container || !scores) return;
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">🏆 Skor Tablosu</div>';
  sorted.forEach(([userId, points], index) => {
    const div = document.createElement('div');
    div.className = `score-item ${index === 0 ? 'winner' : ''}`;
    let username = '?';
    LSA('.user-item').forEach(item => {
      const nameEl = item.querySelector('.user-name');
      if (nameEl) {
        const txt = nameEl.textContent.replace(' (Ben)', '').trim();
        // We'll just use a generic approach
      }
    });
    div.innerHTML = `<div class="score-name">${index === 0 ? '👑' : `${index + 1}.`}<span>${escHtml(username)}</span></div><span class="score-points">${points} puan</span>`;
    container.appendChild(div);
  });
}

function showGameEnd(type, scores, winner) {
  const names = { riddle: '🎯 Bilmece', word: '📝 Kelime Tahmin', trivia: '🧠 Bilgi Yarışması' };
  gameTimer.classList.add('hidden');
  gameArea.innerHTML = `
    <div class="game-end-container">
      <div class="trophy">🏆</div>
      <h3>Oyun Bitti!</h3>
      <p>${names[type] || 'Oyun'} tamamlandı!</p>
      ${winner ? `<p style="font-size:16px;color:var(--warning);font-weight:700;">🎉 ${escHtml(winner.username)} kazandı! 🎉</p>` : ''}
      <button id="back-to-menu-btn" class="btn-primary create-btn mt-16"><i class="fas fa-arrow-left"></i> Menüye Dön</button>
    </div>
  `;
  updateGameScores(scores);
  $('back-to-menu-btn').addEventListener('click', () => {
    state.currentGame = null; gameScreen.classList.add('hidden'); gameMenu.classList.remove('hidden');
  });
}

// ===== MENU NAVIGATION =====
function showLoginMenu() { loginMenu.classList.remove('hidden'); createForm.classList.add('hidden'); joinForm.classList.add('hidden'); }
function showCreateForm() { loginMenu.classList.add('hidden'); createForm.classList.remove('hidden'); joinForm.classList.add('hidden'); setTimeout(() => createUsernameInput?.focus(), 200); }
function showJoinForm() { loginMenu.classList.add('hidden'); createForm.classList.add('hidden'); joinForm.classList.remove('hidden'); setTimeout(() => joinUsernameInput?.focus(), 200); }

menuCreateBtn.addEventListener('click', showCreateForm);
menuJoinBtn.addEventListener('click', showJoinForm);
backFromCreate.addEventListener('click', showLoginMenu);
backFromJoin.addEventListener('click', showLoginMenu);

// ===== EVENT LISTENERS =====

// Create Room
createRoomBtn.addEventListener('click', createRoom);
createUsernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoom(); });

function createRoom() {
  const username = createUsernameInput.value.trim();
  if (!username) { createUsernameInput.style.borderColor = 'var(--danger)'; setTimeout(() => createUsernameInput.style.borderColor = '', 2000); return; }
  createRoomBtn.disabled = true;
  createRoomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Oluşturuluyor...';
  connectAndJoin('create', username, null);
}

// Join Room
joinRoomBtn.addEventListener('click', joinRoom);
roomCodeInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoom(); });
joinUsernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoom(); });

function joinRoom() {
  const username = joinUsernameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!username) { joinUsernameInput.style.borderColor = 'var(--danger)'; setTimeout(() => joinUsernameInput.style.borderColor = '', 2000); return; }
  if (!roomCode) { roomCodeInput.style.borderColor = 'var(--danger)'; setTimeout(() => roomCodeInput.style.borderColor = '', 2000); return; }
  joinRoomBtn.disabled = true;
  joinRoomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Katılıyor...';
  connectAndJoin('join', username, roomCode);
}

// Copy room code
copyRoomBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(state.roomId).then(() => {
    showToast('Oda kodu kopyalandı! 📋', 'success');
  }).catch(() => {
    showToast('Kopyalanamadı', 'error');
  });
});

// Media controls
$('toggle-mic-btn').addEventListener('click', toggleMic);
$('toggle-cam-btn').addEventListener('click', toggleCam);
$('screen-share-btn').addEventListener('click', toggleScreenShare);

// Tab switching
$('toggle-users-btn').addEventListener('click', () => switchTab('users'));
$('toggle-chat-btn').addEventListener('click', () => switchTab('chat'));
$('toggle-games-btn').addEventListener('click', () => switchTab('games'));

// Chat
chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
chatInput.addEventListener('input', handleTyping);

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  state.socket.emit('chat-message', { message, type: 'text' });
  chatInput.value = '';
  if (state.isTyping) { state.isTyping = false; state.socket.emit('typing-stop'); }
}

function handleTyping() {
  if (!state.isTyping && chatInput.value.trim()) {
    state.isTyping = true;
    state.socket.emit('typing-start');
  }
  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => {
    if (state.isTyping) { state.isTyping = false; state.socket.emit('typing-stop'); }
  }, 2000);
}

// Emoji
emojiBtn.addEventListener('click', () => {
  emojiPicker.classList.toggle('hidden');
});

LSA('.emoji-grid span').forEach(el => {
  el.addEventListener('click', () => {
    chatInput.value += el.textContent;
    chatInput.focus();
    emojiPicker.classList.add('hidden');
  });
});

// Close emoji picker on click outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.emoji-picker') && !e.target.closest('.btn-emoji')) {
    emojiPicker.classList.add('hidden');
  }
});

// Game cards
LSA('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    const game = card.dataset.game;
    if (!state.socket?.connected) { showToast('Bağlantı yok!', 'error'); return; }
    switch (game) {
      case 'riddle': state.socket.emit('start-riddle-game'); break;
      case 'word': state.socket.emit('start-word-game'); break;
      case 'trivia': state.socket.emit('start-trivia-game'); break;
    }
  });
});

// Exit game
$('exit-game-btn').addEventListener('click', () => {
  state.currentGame = null; gameScreen.classList.add('hidden'); gameMenu.classList.remove('hidden');
});

// Leave room
$('leave-btn').addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğine emin misin?')) {
    if (state.localStream) state.localStream.getTracks().forEach(t => t.stop());
    Object.values(state.peers).forEach(pc => pc.close());
    state.peers = {};
    if (state.socket) state.socket.disconnect();
    appScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    showLoginMenu();
    remoteVideos.innerHTML = '';
    chatMessages.innerHTML = '';
    gameMenu.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    state.currentGame = null; state.connected = false;
    connStatus.className = 'conn-status';
  }
});

// ===== MOBILE SWIPE =====
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const threshold = 80;
  const diff = touchStartX - touchEndX;
  
  if (Math.abs(diff) > threshold) {
    const tabs = ['users', 'chat', 'games'];
    const activeTab = LSA('.panel-tab:not(.hidden)');
    let currentIndex = -1;
    activeTab.forEach(tab => {
      const id = tab.id.replace('-tab', '');
      currentIndex = tabs.indexOf(id);
    });
    
    if (diff > 0 && currentIndex < tabs.length - 1) {
      // Swipe left - next tab
      switchTab(tabs[currentIndex + 1]);
    } else if (diff < 0 && currentIndex > 0) {
      // Swipe right - previous tab
      switchTab(tabs[currentIndex - 1]);
    }
  }
}

// ===== INIT =====
console.log('🚀 Remoce - Görüntülü Sohbet & Oyunlar');
console.log('📱 Mobil ve masaüstü uyumlu');
console.log('🎮 3 oyun modu: Bilmece, Kelime Tahmin, Bilgi Yarışması');
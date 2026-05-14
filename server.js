const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(express.static(path.join(__dirname, 'public')));

// ===== OYUN VERİTABANI =====
const riddles = [
  { question: "Ben giderim o gider, arkamdan tık tık eder?", answer: "gölge" },
  { question: "Dal üstünde al yanak, içi dolu boncuk?", answer: "nar" },
  { question: "Mavi atlas, ipliksiz, düğmesiz?", answer: "gökyüzü" },
  { question: "İçi kırmızı, dışı yeşil, tavşanın sevdiği şey?", answer: "havuç" },
  { question: "Uçar kuş değil, gider at değil?", answer: "bulut" },
  { question: "Yer altında sakallı dede?", answer: "pırasa" },
  { question: "Benim bir hayvanım var, kuyruğu var başı yok?", answer: "iğne" },
  { question: "İki camlı pencere, bakarım her sabah?", answer: "gözlük" },
  { question: "Küçücük fırın, içi dolu koruk?", answer: "ceviz" },
  { question: "Benim bir kızım var, herkes ona hayran, giydiği yeşil elbise, kırmızı ayakkabı?", answer: "karpuz" },
  { question: "Ne ağzı var ne dili, konuşur insan gibi?", answer: "kitap" },
  { question: "Uzaktan baktım bir taş, yanına vardım dört ayaklı bir kuş?", answer: "kaplumbağa" },
  { question: "Dağdan gelir, taştan gelir, bir kükremiş aslan gelir?", answer: "sel" },
  { question: "Bir kutum var, içi daha dolu, gece açarım, gündüz kapatırım?", answer: "göz" },
  { question: "Küçücük bir kutu, içi dolu umut?", answer: "yumurta" },
  { question: "Altı mermer, üstü mermer, içinde bir bülbül öter?", answer: "ağız" },
  { question: "Ben giderim o gelir, beni hiç yalnız koymaz?", answer: "nefes" },
  { question: "Ufacık bir fırın, içinde kırmızı kor?", answer: "nar" },
  { question: "Bir kuyruğu var, başı yok, elbisesi yeşil, içi kırmızı?", answer: "karpuz" },
  { question: "Sesi var canı yok, konuşur insan gibi?", answer: "telefon" },
  { question: "Yer altında sarı kıvrık, üstü yeşil örtülük?", answer: "havuç" },
  { question: "İncecik beli, renkli teli, her gün elimizde?", answer: "kalem" },
  { question: "Benim bir sandığım var, içi dolu iğne?", answer: "kirpi" },
  { question: "Gökte gördüm bir köprü, renkleri var yedi türlü?", answer: "gökkuşağı" },
  { question: "Küçücük bir arı, her yere varır, her işe yarar?", answer: "iğne" },
  { question: "Bir küçücük kutu, içi dolu umut, bekler durur gününü?", answer: "yumurta" },
  { question: "Ne göğü var ne gözü, yer altında gezer sözü?", answer: "solucan" },
  { question: "Üstü çizgili, altı düz, herkes onu sever?", answer: "zebra" },
  { question: "Beyaz bir örtü, tüm dünyayı örttü?", answer: "kar" },
  { question: "Daldan dala atlarım, kuyruğumdan sarkarım?", answer: "maymun" },
];

const wordGames = [
  { word: "kitap", hint: "Okumak için kullanılır, sayfaları vardır" },
  { word: "bilgisayar", hint: "Ekranı ve klavyesi vardır, internete bağlanır" },
  { word: "telefon", hint: "İnsanlar uzaktan konuşmak için kullanır" },
  { word: "güneş", hint: "Gökyüzünde parlar, dünyayı ısıtır" },
  { word: "deniz", hint: "Mavidir, içinde balıklar yaşar" },
  { word: "çiçek", hint: "Bahçelerde açar, güzel kokar" },
  { word: "ağaç", hint: "Uzundur, yaprakları vardır, meyve verir" },
  { word: "köpek", hint: "İnsanın en iyi dostudur, havlar" },
  { word: "ekmek", hint: "Fırından alınır, kahvaltıda yenir" },
  { word: "yağmur", hint: "Gökyüzünden damla damla düşer" },
  { word: "araba", hint: "Dört tekerleği vardır, benzinle çalışır" },
  { word: "kalem", hint: "Yazı yazmak için kullanılır, ucu sivridir" },
  { word: "saat", hint: "Zamanı gösterir, duvarda asılıdır" },
  { word: "ayna", hint: "Kendimize bakarız, camdan yapılmıştır" },
  { word: "şemsiye", hint: "Yağmurda ıslanmamak için kullanılır" },
  { word: "pizza", hint: "İtalyan yemeğidir, üstünde peynir olur" },
  { word: "paraşüt", hint: "Gökyüzünden atlayanlar kullanır, süzülerek iner" },
  { word: "uçurtma", hint: "Rüzgarda uçar, ipi vardır, çocuklar sever" },
  { word: "müzik", hint: "Kulakla duyulur, ritmi vardır, dans edilir" },
  { word: "resim", hint: "Fırça ve boyayla yapılır, duvarlara asılır" },
  { word: "balık", hint: "Suda yaşar, pulları vardır, oltayla tutulur" },
  { word: "okul", hint: "Öğrenciler gider, ders yapılır, zil çalar" },
  { word: "hastane", hint: "Hastalar gider, doktorlar çalışır, ilaç verilir" },
  { word: "mutfak", hint: "Yemek pişirilir, ocak vardır, bulaşık yıkanır" },
];

const triviaQuestions = [
  { question: "Dünyanın en büyük okyanusu hangisidir?", options: ["Atlantik", "Pasifik", "Hint", "Arktik"], answer: 1 },
  { question: "Hangi gezegen 'Kızıl Gezegen' olarak bilinir?", options: ["Venüs", "Jüpiter", "Mars", "Satürn"], answer: 2 },
  { question: "Türkiye'nin başkenti neresidir?", options: ["İstanbul", "Ankara", "İzmir", "Bursa"], answer: 1 },
  { question: "En hızlı koşan hayvan hangisidir?", options: ["Aslan", "Çita", "At", "Köpek"], answer: 1 },
  { question: "Hangi renklerin karışımıyla mor renk elde edilir?", options: ["Kırmızı-Sarı", "Mavi-Sarı", "Kırmızı-Mavi", "Yeşil-Sarı"], answer: 2 },
  { question: "İnsan vücudundaki en büyük organ hangisidir?", options: ["Karaciğer", "Kalp", "Deri", "Beyin"], answer: 2 },
  { question: "Hangi ülke 'Yükselen Güneş'in Ülkesi' olarak bilinir?", options: ["Çin", "Japonya", "Kore", "Tayland"], answer: 1 },
  { question: "Bir yılda kaç gün vardır?", options: ["360", "365", "370", "355"], answer: 1 },
  { question: "Hangi hayvan yumurtlar ama kuş değildir?", options: ["Yarasa", "Kaplumbağa", "Balina", "Yunus"], answer: 1 },
  { question: "En büyük kıta hangisidir?", options: ["Afrika", "Kuzey Amerika", "Asya", "Avrupa"], answer: 2 },
  { question: "Atatürk hangi yılda doğmuştur?", options: ["1880", "1881", "1882", "1883"], answer: 1 },
  { question: "Dünyanın en uzun nehri hangisidir?", options: ["Amazon", "Nil", "Mississippi", "Yangtze"], answer: 1 },
  { question: "Hangi hayvanın boynuzları olur?", options: ["Kedi", "Köpek", "Geyik", "Balina"], answer: 2 },
  { question: "En küçük kıta hangisidir?", options: ["Avrupa", "Avustralya", "Antarktika", "Güney Amerika"], answer: 1 },
  { question: "Hangi gezegen Güneş Sistemi'nde en büyüğüdür?", options: ["Satürn", "Neptün", "Jüpiter", "Uranüs"], answer: 2 },
  { question: "İnsan vücudunda kaç kemik vardır (yetişkin)?", options: ["106", "206", "306", "406"], answer: 1 },
  { question: "Hangi meyve C vitamini bakımından en zengindir?", options: ["Elma", "Muz", "Portakal", "Üzüm"], answer: 2 },
  { question: "Dünyanın en yüksek dağı hangisidir?", options: ["K2", "Everest", "Ağrı", "Mont Blanc"], answer: 1 },
  { question: "Hangi ülke en çok nüfusa sahiptir?", options: ["Hindistan", "ABD", "Çin", "Endonezya"], answer: 2 },
  { question: "Türkiye'de en çok hangi şehirde insan yaşar?", options: ["Ankara", "İzmir", "İstanbul", "Bursa"], answer: 2 },
];

// ===== ODA YÖNETİMİ =====
const rooms = {};
const userColors = [
  '#25d366', '#ff6b6b', '#ffa726', '#42a5f5', '#ab47bc',
  '#26a69a', '#ef5350', '#7c4dff', '#66bb6a', '#ff7043',
  '#42a5f5', '#ec407a', '#8d6e63', '#78909c', '#5c6bc0',
];

io.on('connection', (socket) => {
  console.log(`👤 Bağlandı: ${socket.id}`);

  // Oda oluştur
  socket.on('create-room', (username, callback) => {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    const color = userColors[Math.floor(Math.random() * userColors.length)];
    rooms[roomId] = {
      id: roomId,
      users: [{ id: socket.id, username, isAdmin: true, color }],
      game: null,
      gameState: null,
    };
    socket.join(roomId);
    socket.roomId = roomId;
    callback({ success: true, roomId });
    io.to(roomId).emit('room-users', rooms[roomId].users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, color: u.color })));
    console.log(`🏠 Oda oluşturuldu: ${roomId} - ${username}`);
  });

  // Odaya katıl
  socket.on('join-room', ({ roomId, username }, callback) => {
    const room = rooms[roomId.toUpperCase()];
    if (!room) {
      callback({ success: false, error: '❌ Oda bulunamadı!' });
      return;
    }
    if (room.users.length >= 8) {
      callback({ success: false, error: 'Oda dolu! (Maksimum 8 kişi)' });
      return;
    }
    const color = userColors[Math.floor(Math.random() * userColors.length)];
    room.users.push({ id: socket.id, username, isAdmin: false, color });
    socket.join(roomId);
    socket.roomId = roomId;
    callback({ success: true, roomId });
    
    io.to(roomId).emit('room-users', room.users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, color: u.color })));
    io.to(roomId).emit('user-joined', { 
      user: { id: socket.id, username, color },
      users: room.users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, color: u.color })),
    });
    console.log(`🚪 ${username} odaya katıldı: ${roomId}`);
  });

  // Typing indicator
  socket.on('typing-start', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const user = room.users.find(u => u.id === socket.id);
    if (user) {
      socket.to(socket.roomId).emit('typing-start', { userId: socket.id, username: user.username });
    }
  });

  socket.on('typing-stop', () => {
    socket.to(socket.roomId).emit('typing-stop', { userId: socket.id });
  });

  // WebRTC sinyalleme
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('get-users', (callback) => {
    const room = rooms[socket.roomId];
    if (room) {
      callback(room.users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, color: u.color })));
    }
  });

  // ===== OYUN: Bilmece =====
  socket.on('start-riddle-game', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    
    const shuffled = [...riddles].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 15);
    
    room.game = 'riddle';
    room.gameState = {
      riddles: selected,
      currentIndex: 0,
      scores: {},
      answeredUsers: {},
      timer: 30,
      timerInterval: null,
    };
    
    room.users.forEach(u => { room.gameState.scores[u.id] = 0; });
    
    io.to(socket.roomId).emit('game-started', { 
      type: 'riddle', totalRiddles: selected.length,
      currentRiddle: { ...selected[0], totalRiddles: selected.length },
      currentIndex: 0, scores: room.gameState.scores,
    });
    
    startTimer(room, socket.roomId);
  });

  socket.on('riddle-answer', ({ answer }) => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'riddle') return;
    const state = room.gameState;
    if (!state || state.answeredUsers[socket.id]) return;
    
    const currentRiddle = state.riddles[state.currentIndex];
    const isCorrect = answer.toLowerCase().trim() === currentRiddle.answer.toLowerCase().trim();
    
    if (isCorrect) {
      const bonus = Math.max(0, Math.floor(state.timer / 5));
      state.scores[socket.id] = (state.scores[socket.id] || 0) + 10 + bonus;
      state.answeredUsers[socket.id] = true;
      
      const user = room.users.find(u => u.id === socket.id);
      io.to(socket.roomId).emit('correct-answer', { 
        userId: socket.id, username: user?.username || '?',
        scores: { ...state.scores },
        bonus,
      });
      
      checkAllAnswered(room, socket.roomId);
    }
  });

  function checkAllAnswered(room, roomId) {
    const state = room.gameState;
    const allAnswered = room.users.every(u => state.answeredUsers[u.id]);
    if (allAnswered) {
      clearInterval(state.timerInterval);
      setTimeout(() => nextRiddle(room, roomId), 2000);
    }
  }

  socket.on('next-riddle', () => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'riddle') return;
    clearInterval(room.gameState.timerInterval);
    nextRiddle(room, socket.roomId);
  });

  function nextRiddle(room, roomId) {
    const state = room.gameState;
    state.currentIndex++;
    state.answeredUsers = {};
    state.timer = 30;
    
    if (state.currentIndex >= state.riddles.length) {
      endGame(room, roomId, 'riddle');
      return;
    }
    
    io.to(roomId).emit('next-riddle', {
      currentRiddle: { ...state.riddles[state.currentIndex], totalRiddles: state.riddles.length },
      currentIndex: state.currentIndex,
      scores: { ...state.scores },
    });
    startTimer(room, roomId);
  }

  // ===== OYUN: Kelime Tahmin =====
  socket.on('start-word-game', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    
    const shuffled = [...wordGames].sort(() => Math.random() - 0.5);
    
    room.game = 'word';
    room.gameState = {
      words: shuffled,
      currentIndex: 0,
      scores: {},
      drawerIndex: 0,
      guessedUsers: {},
      hintsRevealed: 0,
      timer: 60,
      timerInterval: null,
    };
    
    room.users.forEach(u => { room.gameState.scores[u.id] = 0; });
    startWordRound(room, socket.roomId);
  });

  function startWordRound(room, roomId) {
    const state = room.gameState;
    state.drawerIndex = state.drawerIndex % room.users.length;
    const drawerUser = room.users[state.drawerIndex];
    const currentWord = state.words[state.currentIndex];
    
    state.guessedUsers = {};
    state.hintsRevealed = 0;
    state.timer = 60;
    
    io.to(roomId).emit('word-round-start', {
      drawerId: drawerUser.id,
      drawerUsername: drawerUser.username,
      word: currentWord.word,
      hint: currentWord.hint,
      currentIndex: state.currentIndex,
      totalWords: Math.min(state.words.length, 10),
      scores: { ...state.scores },
      timer: state.timer,
    });
    startTimer(room, roomId);
  }

  socket.on('word-guess', ({ guess }) => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'word') return;
    const state = room.gameState;
    if (!state) return;
    
    const currentWord = state.words[state.currentIndex];
    const drawerUser = room.users[state.drawerIndex % room.users.length];
    
    if (socket.id === drawerUser.id || state.guessedUsers[socket.id]) return;
    
    const isCorrect = guess.toLowerCase().trim() === currentWord.word.toLowerCase().trim();
    
    if (isCorrect) {
      state.guessedUsers[socket.id] = true;
      const points = Math.max(10 - state.hintsRevealed * 2, 2);
      state.scores[socket.id] = (state.scores[socket.id] || 0) + points;
      state.scores[drawerUser.id] = (state.scores[drawerUser.id] || 0) + 5;
      
      const user = room.users.find(u => u.id === socket.id);
      io.to(roomId).emit('word-guessed', {
        userId: socket.id, username: user?.username || '?',
        word: currentWord.word, scores: { ...state.scores },
      });
      
      const allGuessed = room.users.every(u => u.id === drawerUser.id || state.guessedUsers[u.id]);
      if (allGuessed) {
        clearInterval(state.timerInterval);
        setTimeout(() => nextWordRound(room, roomId), 2000);
      }
    }
  });

  socket.on('word-hint', () => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'word') return;
    const state = room.gameState;
    if (!state) return;
    state.hintsRevealed++;
    io.to(socket.roomId).emit('word-hint-revealed', { hintLevel: state.hintsRevealed, timer: state.timer });
  });

  socket.on('next-word', () => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'word') return;
    clearInterval(room.gameState.timerInterval);
    nextWordRound(room, socket.roomId);
  });

  function nextWordRound(room, roomId) {
    const state = room.gameState;
    state.currentIndex++;
    
    if (state.currentIndex >= 10 || state.currentIndex >= state.words.length) {
      state.drawerIndex++;
      if (state.drawerIndex >= room.users.length) {
        endGame(room, roomId, 'word');
        return;
      }
      state.currentIndex = 0;
    }
    startWordRound(room, roomId);
  }

  // ===== OYUN: Bilgi Yarışması =====
  socket.on('start-trivia-game', () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    
    const shuffled = [...triviaQuestions].sort(() => Math.random() - 0.5);
    
    room.game = 'trivia';
    room.gameState = {
      questions: shuffled,
      currentIndex: 0,
      scores: {},
      answeredUsers: {},
      timer: 20,
      timerInterval: null,
    };
    
    room.users.forEach(u => { room.gameState.scores[u.id] = 0; });
    sendTriviaQuestion(room, socket.roomId);
  });

  function sendTriviaQuestion(room, roomId) {
    const state = room.gameState;
    state.answeredUsers = {};
    state.timer = 20;
    
    io.to(roomId).emit('trivia-question', {
      question: state.questions[state.currentIndex],
      currentIndex: state.currentIndex,
      totalQuestions: 15,
      scores: { ...state.scores },
      timer: state.timer,
    });
    startTimer(room, roomId);
  }

  socket.on('trivia-answer', ({ answerIndex }) => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'trivia') return;
    const state = room.gameState;
    if (!state || state.answeredUsers[socket.id]) return;
    
    state.answeredUsers[socket.id] = true;
    const q = state.questions[state.currentIndex];
    const isCorrect = answerIndex === q.answer;
    
    if (isCorrect) {
      state.scores[socket.id] = (state.scores[socket.id] || 0) + 10;
    }
    
    const user = room.users.find(u => u.id === socket.id);
    io.to(roomId).emit('trivia-answer-result', {
      userId: socket.id, username: user?.username || '?',
      isCorrect, correctAnswer: q.answer,
      scores: { ...state.scores },
    });
    
    checkAllAnswered(room, roomId);
  });

  socket.on('next-trivia', () => {
    const room = rooms[socket.roomId];
    if (!room || room.game !== 'trivia') return;
    clearInterval(room.gameState.timerInterval);
    nextTriviaQuestion(room, socket.roomId);
  });

  function nextTriviaQuestion(room, roomId) {
    const state = room.gameState;
    state.currentIndex++;
    if (state.currentIndex >= 15) {
      endGame(room, roomId, 'trivia');
      return;
    }
    sendTriviaQuestion(room, roomId);
  }

  // ===== ZAMANLAYICI =====
  function startTimer(room, roomId) {
    if (room.gameState.timerInterval) clearInterval(room.gameState.timerInterval);
    
    room.gameState.timerInterval = setInterval(() => {
      room.gameState.timer--;
      io.to(roomId).emit('timer-tick', { timer: room.gameState.timer });
      
      if (room.gameState.timer <= 0) {
        clearInterval(room.gameState.timerInterval);
        
        if (room.game === 'riddle') {
          const currentRiddle = room.gameState.riddles[room.gameState.currentIndex];
          io.to(roomId).emit('time-up-riddle', { answer: currentRiddle.answer });
          setTimeout(() => nextRiddle(room, roomId), 3000);
        } else if (room.game === 'word') {
          const currentWord = room.gameState.words[room.gameState.currentIndex];
          io.to(roomId).emit('time-up-word', { word: currentWord.word });
          setTimeout(() => nextWordRound(room, roomId), 3000);
        } else if (room.game === 'trivia') {
          const q = room.gameState.questions[room.gameState.currentIndex];
          io.to(roomId).emit('time-up-trivia', { correctAnswer: q.answer });
          setTimeout(() => nextTriviaQuestion(room, roomId), 3000);
        }
      }
    }, 1000);
  }

  // ===== OYUN BİTİRME =====
  function endGame(room, roomId, type) {
    if (room.gameState && room.gameState.timerInterval) {
      clearInterval(room.gameState.timerInterval);
    }
    
    const sorted = Object.entries(room.gameState.scores).sort((a, b) => b[1] - a[1]);
    const winner = room.users.find(u => u.id === sorted[0]?.[0]);
    
    io.to(roomId).emit('game-ended', {
      type,
      scores: { ...room.gameState.scores },
      winner: winner ? { id: winner.id, username: winner.username } : null,
    });
    
    room.game = null;
    room.gameState = null;
  }

  // ===== SOHBET =====
  socket.on('chat-message', ({ message, type }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const user = room.users.find(u => u.id === socket.id);
    if (!user) return;
    
    io.to(socket.roomId).emit('chat-message', {
      userId: socket.id,
      username: user.username,
      color: user.color,
      message,
      type: type || 'text',
      timestamp: Date.now(),
    });
  });

  // ===== BAĞLANTI KESİLME =====
  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (room) {
      const leftUser = room.users.find(u => u.id === socket.id);
      room.users = room.users.filter(u => u.id !== socket.id);
      
      if (room.gameState && room.gameState.timerInterval) {
        clearInterval(room.gameState.timerInterval);
      }
      
      if (room.users.length === 0) {
        delete rooms[socket.roomId];
        console.log(`🗑️ Oda silindi: ${socket.roomId}`);
      } else {
        if (!room.users.some(u => u.isAdmin)) {
          room.users[0].isAdmin = true;
        }
        io.to(socket.roomId).emit('user-left', { 
          users: room.users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, color: u.color })),
          leftUser: leftUser ? { id: leftUser.id, username: leftUser.username } : null,
        });
        
        if (room.game === 'word') {
          const state = room.gameState;
          if (state && state.drawerIndex < room.users.length) {
            // drawer ayrıldıysa sonraki tura geç
          }
        }
      }
    }
    console.log(`🚫 Ayrıldı: ${socket.id}`);
  });
});

// ===== SUNUCU BAŞLAT =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════╗`);
  console.log(`║     🚀 Remoce Sunucu Çalışıyor   ║`);
  console.log(`╠══════════════════════════════════╣`);
  console.log(`║  Local:  http://localhost:${PORT}     ║`);
  console.log(`║  Ağ:     http://${getLocalIP()}:${PORT}    ║`);
  console.log(`╚══════════════════════════════════╝\n`);
});

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
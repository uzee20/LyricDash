const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const audioFileInput = document.getElementById("audioFile");
const lrcFileInput = document.getElementById("lrcFile");
const connectButton = document.getElementById("connectButton");
const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const startMatchButton = document.getElementById("startMatchButton");
const connectionStatus = document.getElementById("connectionStatus");
const roomCodeValue = document.getElementById("roomCodeValue");
const roleValue = document.getElementById("roleValue");
const roomSummary = document.getElementById("roomSummary");
const matchStatePill = document.getElementById("matchStatePill");
const playersList = document.getElementById("playersList");
const leaderboardList = document.getElementById("leaderboardList");
const countdownValue = document.getElementById("countdownValue");
const statusMessage = document.getElementById("statusMessage");
const lobbyScreen = document.getElementById("lobbyScreen");
const gameScreen = document.getElementById("gameScreen");
const resultScreen = document.getElementById("resultScreen");
const returnLobbyButton = document.getElementById("returnLobbyButton");
const winnerName = document.getElementById("winnerName");
const winnerStats = document.getElementById("winnerStats");
const finalStandingsList = document.getElementById("finalStandingsList");
const resultScoreValue = document.getElementById("resultScoreValue");
const resultAccuracyValue = document.getElementById("resultAccuracyValue");
const resultProgressValue = document.getElementById("resultProgressValue");
const audioPlayer = document.getElementById("audioPlayer");
const scoreValue = document.getElementById("scoreValue");
const comboValue = document.getElementById("comboValue");
const accuracyValue = document.getElementById("accuracyValue");
const progressValue = document.getElementById("progressValue");
const timelineFill = document.getElementById("timelineFill");
const lineTimestamp = document.getElementById("lineTimestamp");
const lineCounter = document.getElementById("lineCounter");
const lyricDisplay = document.getElementById("lyricDisplay");
const typingInput = document.getElementById("typingInput");

const state = {
  ws: null,
  connected: false,
  roomCode: "",
  playerId: "",
  playerName: "",
  role: "",
  players: [],
  isHost: false,
  assets: null,
  audioUrl: "",
  lyrics: [],
  activeLineIndex: -1,
  activeWordIndex: 0,
  score: 0,
  combo: 0,
  correctWords: 0,
  attemptedWords: 0,
  totalWords: 0,
  gameStarted: false,
  currentScreen: "lobby",
  rafId: 0,
  countdownTimer: 0,
  scoreSyncTimer: 0,
};

function setScreen(screenName) {
  state.currentScreen = screenName;

  const showLobby = screenName === "lobby";
  const showGame = screenName === "game";
  const showResults = screenName === "results";

  document.querySelectorAll(".screen-lobby").forEach((element) => {
    element.classList.toggle("hidden", !showLobby);
  });
  lobbyScreen.classList.toggle("hidden", !showLobby);
  gameScreen.classList.toggle("hidden", !showGame);
  resultScreen.classList.toggle("hidden", !showResults);
}

function parseLrc(text) {
  const lines = text
    .split(/\r?\n/)
    .map((rawLine) => rawLine.trim())
    .filter(Boolean);

  const lyricEntries = [];
  const timestampPattern = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  lines.forEach((line) => {
    const timestamps = [...line.matchAll(timestampPattern)];
    const lyricText = line.replace(timestampPattern, "").trim();

    if (!timestamps.length || !lyricText) {
      return;
    }

    const words = lyricText.split(/\s+/).filter(Boolean);

    timestamps.forEach((match) => {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
      lyricEntries.push({
        time: minutes * 60 + seconds + fraction / 1000,
        text: lyricText,
        words,
      });
    });
  });

  return lyricEntries.sort((a, b) => a.time - b.time);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00.00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function updateConnectionUi() {
  connectionStatus.textContent = state.connected ? "Tersambung" : "Belum terhubung";
  createRoomButton.disabled = !(
    state.connected &&
    playerNameInput.value.trim() &&
    audioFileInput.files.length &&
    lrcFileInput.files.length &&
    !state.roomCode
  );
  joinRoomButton.disabled = !(
    state.connected &&
    playerNameInput.value.trim() &&
    roomCodeInput.value.trim() &&
    !state.roomCode
  );
  startMatchButton.disabled = !(state.connected && state.isHost && state.roomCode && state.players.length > 0 && !state.gameStarted);
}

function stopLoop() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }
}

function clearCountdown() {
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = 0;
  }
}

function clearScoreSync() {
  if (state.scoreSyncTimer) {
    clearInterval(state.scoreSyncTimer);
    state.scoreSyncTimer = 0;
  }
}

function resetGameStats() {
  state.activeLineIndex = -1;
  state.activeWordIndex = 0;
  state.score = 0;
  state.combo = 0;
  state.correctWords = 0;
  state.attemptedWords = 0;
  state.totalWords = state.lyrics.reduce((sum, entry) => sum + entry.words.length, 0);
  state.gameStarted = false;

  scoreValue.textContent = "0";
  comboValue.textContent = "0";
  accuracyValue.textContent = "100%";
  progressValue.textContent = `0 / ${state.totalWords}`;
  timelineFill.style.width = "0%";
  lineTimestamp.textContent = "00:00.00";
  lineCounter.textContent = `Baris 0 / ${state.lyrics.length}`;
  typingInput.value = "";
  typingInput.disabled = true;
  lyricDisplay.innerHTML = '<p class="empty-state">Game akan mulai setelah host menekan Start Match.</p>';
}

function resetAssets() {
  if (state.audioUrl) {
    URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = "";
  }

  state.assets = null;
  state.lyrics = [];
  audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  stopLoop();
  clearScoreSync();
  clearCountdown();
  resetGameStats();
  setScreen("lobby");
}

function updateStats() {
  scoreValue.textContent = String(state.score);
  comboValue.textContent = String(state.combo);
  const accuracy = state.attemptedWords === 0
    ? 100
    : Math.round((state.correctWords / state.attemptedWords) * 100);
  accuracyValue.textContent = `${accuracy}%`;
  progressValue.textContent = `${state.correctWords} / ${state.totalWords}`;
}

function updateTimeline() {
  if (!audioPlayer.duration || !Number.isFinite(audioPlayer.duration)) {
    timelineFill.style.width = "0%";
    return;
  }

  const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  timelineFill.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
}

function findActiveLineIndex(currentTime) {
  let currentIndex = -1;
  for (let index = 0; index < state.lyrics.length; index += 1) {
    if (state.lyrics[index].time <= currentTime) {
      currentIndex = index;
    } else {
      break;
    }
  }
  return currentIndex;
}

function renderActiveLine() {
  if (state.activeLineIndex < 0 || !state.lyrics[state.activeLineIndex]) {
    lyricDisplay.innerHTML = '<p class="empty-state">Menunggu lirik pertama diputar.</p>';
    return;
  }

  const line = state.lyrics[state.activeLineIndex];
  const wordsHtml = line.words.map((word, index) => {
    let cssClass = "upcoming";
    if (index < state.activeWordIndex) {
      cssClass = "done";
    } else if (index === state.activeWordIndex) {
      cssClass = "active";
    }
    return `<span class="word ${cssClass}">${word}</span>`;
  }).join("");

  lyricDisplay.innerHTML = `<p class="line-text">${wordsHtml}</p>`;
  lineTimestamp.textContent = formatTime(line.time);
  lineCounter.textContent = `Baris ${state.activeLineIndex + 1} / ${state.lyrics.length}`;
}

function setActiveLine(index) {
  if (index === state.activeLineIndex) {
    return;
  }

  state.activeLineIndex = index;
  state.activeWordIndex = 0;
  typingInput.value = "";
  renderActiveLine();
}

function gameLoop() {
  updateTimeline();
  const nextLineIndex = findActiveLineIndex(audioPlayer.currentTime);
  if (nextLineIndex !== state.activeLineIndex) {
    setActiveLine(nextLineIndex);
  }

  if (!audioPlayer.paused && !audioPlayer.ended) {
    state.rafId = requestAnimationFrame(gameLoop);
  } else {
    stopLoop();
  }
}

function normalizeWord(word) {
  return word.trim().toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function prepareSharedAssets(assetBundle) {
  resetAssets();
  state.assets = assetBundle;
  state.lyrics = parseLrc(assetBundle.lrcText);

  if (!state.lyrics.length) {
    throw new Error("Lirik room tidak valid.");
  }

  const response = await fetch(assetBundle.audioDataUrl);
  const audioBlob = await response.blob();
  state.audioUrl = URL.createObjectURL(audioBlob);
  audioPlayer.src = state.audioUrl;
  audioPlayer.load();
  resetGameStats();
}

function renderPlayers() {
  if (!state.players.length) {
    playersList.innerHTML = '<p class="empty-state">Daftar pemain akan muncul di sini.</p>';
    leaderboardList.innerHTML = '<p class="empty-state">Leaderboard akan tampil saat room aktif.</p>';
    return;
  }

  playersList.innerHTML = state.players.map((player) => {
    const badges = [];
    if (player.isHost) {
      badges.push('<span class="badge badge-host">Host</span>');
    }
    if (player.id === state.playerId) {
      badges.push('<span class="badge badge-you">Kamu</span>');
    }
    if (player.isReady) {
      badges.push('<span class="badge badge-ready">Ready</span>');
    }

    return `
      <article class="player-card">
        <div class="player-top">
          <strong>${player.name}</strong>
          <span>${player.score} pts</span>
        </div>
        <div class="player-badges">${badges.join("") || '<span class="badge">Waiting</span>'}</div>
      </article>
    `;
  }).join("");

  const ordered = [...state.players].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.name.localeCompare(b.name);
  });

  leaderboardList.innerHTML = ordered.map((player, index) => `
    <article class="leaderboard-item">
      <div class="leaderboard-top">
        <strong>#${index + 1} ${player.name}</strong>
        <span>${player.score} pts</span>
      </div>
      <span>Akurasi ${player.accuracy}% | Progress ${player.correctWords}/${player.totalWords || state.totalWords}</span>
    </article>
  `).join("");
}

function updateRoomUi() {
  roomCodeValue.textContent = state.roomCode || "-";
  roleValue.textContent = state.role || "-";
  roomSummary.textContent = state.roomCode
    ? `Room ${state.roomCode} berisi ${state.players.length} pemain.`
    : "Belum ada room aktif.";
  updateConnectionUi();
  renderPlayers();
}

function getOrderedPlayers() {
  return [...state.players].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.correctWords !== a.correctWords) {
      return b.correctWords - a.correctWords;
    }
    return a.name.localeCompare(b.name);
  });
}

function sendSocketMessage(payload) {
  if (!state.ws || !state.connected) {
    return;
  }
  state.ws.emit(payload.type, payload);
}

function startScoreSync() {
  clearScoreSync();
  state.scoreSyncTimer = window.setInterval(() => {
    if (!state.gameStarted) {
      return;
    }

    sendSocketMessage({
      type: "score_update",
      roomCode: state.roomCode,
      playerId: state.playerId,
      score: state.score,
      accuracy: Number(accuracyValue.textContent.replace("%", "")),
      correctWords: state.correctWords,
      totalWords: state.totalWords,
      combo: state.combo,
      currentTime: audioPlayer.currentTime,
    });
  }, 300);
}

function handleGameFinished() {
  clearScoreSync();
  typingInput.disabled = true;
  state.gameStarted = false;
  sendSocketMessage({
    type: "player_finished",
    roomCode: state.roomCode,
    playerId: state.playerId,
    score: state.score,
    accuracy: Number(accuracyValue.textContent.replace("%", "")),
    correctWords: state.correctWords,
    totalWords: state.totalWords,
  });
  setStatus(`Match selesai. Skor akhir ${state.score} dengan akurasi ${accuracyValue.textContent}.`);
}

function beginCountdown(startAt) {
  clearCountdown();

  const tick = () => {
    const remaining = Math.max(0, startAt - Date.now());
    countdownValue.textContent = remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : "Mulai";

    if (remaining <= 0) {
      clearCountdown();
      launchGame();
    }
  };

  tick();
  state.countdownTimer = window.setInterval(tick, 100);
}

async function launchGame() {
  if (!state.assets) {
    setStatus("Asset room belum siap.");
    return;
  }

  try {
    audioPlayer.currentTime = 0;
    typingInput.disabled = false;
    typingInput.focus();
    state.gameStarted = true;
    setScreen("game");
    updateConnectionUi();

    const playPromise = audioPlayer.play();
    if (playPromise instanceof Promise) {
      await playPromise;
    }

    matchStatePill.textContent = "Match Berjalan";
    countdownValue.textContent = "GO";
    setStatus("Match dimulai. Ketik secepat dan setepat mungkin.");
    stopLoop();
    state.rafId = requestAnimationFrame(gameLoop);
    startScoreSync();
  } catch (error) {
    setStatus("Autoplay diblokir browser. Klik halaman lalu coba lagi.");
  }
}

function connectSocket() {
  if (state.ws && state.connected) {
    return;
  }

  state.ws = io();
  connectionStatus.textContent = "Menyambung...";

  state.ws.on("connect", () => {
    state.connected = true;
    updateConnectionUi();
    setStatus("Server lokal terhubung. Sekarang kamu bisa membuat atau masuk room.");
  });

  state.ws.on("disconnect", () => {
    state.connected = false;
    state.roomCode = "";
    state.playerId = "";
    state.players = [];
    state.role = "";
    state.isHost = false;
    matchStatePill.textContent = "Terputus";
    updateRoomUi();
    resetAssets();
    setStatus("Koneksi WebSocket terputus. Sambungkan ulang ke server.");
  });

  state.ws.on("room_created", async (payload) => {
    await handleSocketMessage({ type: "room_created", ...payload });
  });

  state.ws.on("room_joined", async (payload) => {
    await handleSocketMessage({ type: "room_joined", ...payload });
  });

  state.ws.on("room_state", async (payload) => {
    await handleSocketMessage({ type: "room_state", ...payload });
  });

  state.ws.on("match_started", async (payload) => {
    await handleSocketMessage({ type: "match_started", ...payload });
  });

  state.ws.on("match_finished", async (payload) => {
    await handleSocketMessage({ type: "match_finished", ...payload });
  });

  state.ws.on("error_message", async (payload) => {
    await handleSocketMessage({ type: "error", message: payload.message });
  });
}

async function handleSocketMessage(payload) {
  if (payload.type === "room_created") {
    state.roomCode = payload.room.code;
    state.playerId = payload.player.id;
    state.role = "Host";
    state.isHost = true;
    state.players = payload.room.players;
    matchStatePill.textContent = "Lobby";
    await prepareSharedAssets(payload.room.assets);
    setScreen("lobby");
    updateRoomUi();
    setStatus(`Room ${state.roomCode} berhasil dibuat. Bagikan kode room ke pemain lain.`);
    return;
  }

  if (payload.type === "room_joined") {
    state.roomCode = payload.room.code;
    state.playerId = payload.player.id;
    state.role = "Player";
    state.isHost = false;
    state.players = payload.room.players;
    matchStatePill.textContent = "Lobby";
    await prepareSharedAssets(payload.room.assets);
    setScreen("lobby");
    updateRoomUi();
    setStatus(`Berhasil masuk ke room ${state.roomCode}. Menunggu host memulai match.`);
    return;
  }

  if (payload.type === "room_state") {
    state.players = payload.room.players;
    matchStatePill.textContent = payload.room.matchStateLabel;
    updateRoomUi();
    return;
  }

  if (payload.type === "match_started") {
    state.players = payload.room.players;
    matchStatePill.textContent = "Countdown";
    resetGameStats();
    setScreen("game");
    updateRoomUi();
    beginCountdown(payload.startAt);
    setStatus("Host memulai match. Bersiap...");
    return;
  }

  if (payload.type === "match_finished") {
    state.players = payload.room.players;
    matchStatePill.textContent = "Selesai";
    updateRoomUi();
    showResults();
    setStatus("Semua pemain selesai. Match berakhir.");
    return;
  }

  if (payload.type === "error") {
    setStatus(payload.message);
  }
}

async function createRoom() {
  const name = playerNameInput.value.trim();
  const audioFile = audioFileInput.files[0];
  const lrcFile = lrcFileInput.files[0];

  if (!name || !audioFile || !lrcFile) {
    setStatus("Nama pemain, audio, dan file lirik harus diisi.");
    return;
  }

  try {
    createRoomButton.disabled = true;
    setStatus("Membaca file dan membuat room...");

    const [audioDataUrl, lrcText] = await Promise.all([
      toDataUrl(audioFile),
      lrcFile.text(),
    ]);

    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playerName: name,
        audioName: audioFile.name,
        audioType: audioFile.type || "audio/mpeg",
        audioDataUrl,
        lrcText,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Gagal membuat room.");
    }

    state.playerName = name;
    sendSocketMessage({
      type: "register_player",
      roomCode: payload.room.code,
      playerId: payload.player.id,
    });
  } catch (error) {
    setStatus(error.message || "Gagal membuat room.");
  } finally {
    updateConnectionUi();
  }
}

async function joinRoom() {
  const name = playerNameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();

  if (!name || !roomCode) {
    setStatus("Nama pemain dan kode room harus diisi.");
    return;
  }

  try {
    joinRoomButton.disabled = true;
    setStatus("Mencoba masuk ke room...");

    const response = await fetch(`/api/rooms/${roomCode}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerName: name }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Gagal gabung room.");
    }

    state.playerName = name;
    sendSocketMessage({
      type: "register_player",
      roomCode: payload.room.code,
      playerId: payload.player.id,
    });
  } catch (error) {
    setStatus(error.message || "Gagal gabung room.");
  } finally {
    updateConnectionUi();
  }
}

function startMatch() {
  if (!state.isHost || !state.roomCode) {
    return;
  }

  sendSocketMessage({
    type: "start_match",
    roomCode: state.roomCode,
    playerId: state.playerId,
  });
}

function showResults() {
  const orderedPlayers = getOrderedPlayers();
  const champion = orderedPlayers[0];
  const me = state.players.find((player) => player.id === state.playerId);

  if (!champion) {
    winnerName.textContent = "-";
    winnerStats.textContent = "Belum ada data hasil pertandingan.";
    finalStandingsList.innerHTML = '<p class="empty-state">Hasil akhir akan muncul di sini.</p>';
  } else {
    winnerName.textContent = champion.name;
    winnerStats.textContent = `Skor ${champion.score} pts dengan akurasi ${champion.accuracy}% dan progress ${champion.correctWords}/${champion.totalWords || state.totalWords}.`;
    finalStandingsList.innerHTML = orderedPlayers.map((player, index) => `
      <article class="leaderboard-item">
        <div class="leaderboard-top">
          <strong>#${index + 1} ${player.name}</strong>
          <span>${player.score} pts</span>
        </div>
        <span>Akurasi ${player.accuracy}% | Progress ${player.correctWords}/${player.totalWords || state.totalWords}</span>
      </article>
    `).join("");
  }

  resultScoreValue.textContent = String(me?.score ?? state.score);
  resultAccuracyValue.textContent = `${me?.accuracy ?? Number(accuracyValue.textContent.replace("%", ""))}%`;
  resultProgressValue.textContent = `${me?.correctWords ?? state.correctWords} / ${me?.totalWords || state.totalWords}`;
  setScreen("results");
}

function advanceWord() {
  const line = state.lyrics[state.activeLineIndex];
  if (!line) {
    return;
  }

  state.activeWordIndex += 1;
  state.correctWords += 1;
  state.combo += 1;
  state.score += 10 + Math.max(0, state.combo - 1) * 2;
  updateStats();
  renderActiveLine();
}

function handleWrongWord() {
  state.combo = 0;
  state.score = Math.max(0, state.score - 5);
  updateStats();
}

playerNameInput.addEventListener("input", updateConnectionUi);
roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
  updateConnectionUi();
});
audioFileInput.addEventListener("change", updateConnectionUi);
lrcFileInput.addEventListener("change", updateConnectionUi);

connectButton.addEventListener("click", connectSocket);
createRoomButton.addEventListener("click", createRoom);
joinRoomButton.addEventListener("click", joinRoom);
startMatchButton.addEventListener("click", startMatch);
returnLobbyButton.addEventListener("click", () => {
  setScreen("lobby");
});

typingInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();

  if (!state.gameStarted || state.activeLineIndex < 0) {
    return;
  }

  const line = state.lyrics[state.activeLineIndex];
  const targetWord = line.words[state.activeWordIndex];
  if (!targetWord) {
    return;
  }

  const typedWord = normalizeWord(typingInput.value);
  const expectedWord = normalizeWord(targetWord);
  if (!typedWord) {
    return;
  }

  state.attemptedWords += 1;
  if (typedWord === expectedWord) {
    advanceWord();
    typingInput.value = "";
  } else {
    handleWrongWord();
    typingInput.select();
  }
});

audioPlayer.addEventListener("play", () => {
  if (state.gameStarted && !state.rafId) {
    state.rafId = requestAnimationFrame(gameLoop);
  }
});

audioPlayer.addEventListener("pause", () => {
  if (state.gameStarted && !audioPlayer.ended) {
    stopLoop();
  }
});

audioPlayer.addEventListener("ended", () => {
  stopLoop();
  timelineFill.style.width = "100%";
  handleGameFinished();
});

audioPlayer.addEventListener("seeking", () => {
  if (!state.gameStarted) {
    return;
  }
  setActiveLine(findActiveLineIndex(audioPlayer.currentTime));
});

updateConnectionUi();
resetGameStats();
setScreen("lobby");

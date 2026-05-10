const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.join(ROOT, "frontend");
const UPLOADS_ROOT = path.join(ROOT, "uploads");
const MAX_AUDIO_UPLOAD_BYTES = 8 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

const rooms = new Map();
const playerSockets = new Map();

fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? createRoomCode() : code;
}

function createPlayer(name, isHost = false) {
  return {
    id: crypto.randomUUID(),
    name,
    isHost,
    isReady: true,
    isFinished: false,
    score: 0,
    accuracy: 100,
    correctWords: 0,
    totalWords: 0,
    combo: 0,
  };
}

function summarizeRoom(room) {
  return {
    code: room.code,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      isReady: player.isReady,
      isFinished: player.isFinished,
      score: player.score,
      accuracy: player.accuracy,
      correctWords: player.correctWords,
      totalWords: player.totalWords,
      combo: player.combo,
    })),
    assets: room.assets
      ? {
          audioName: room.assets.audioName,
          audioType: room.assets.audioType,
          audioUrl: room.assets.audioUrl,
          lrcText: room.assets.lrcText,
        }
      : null,
    matchStateLabel: room.matchStateLabel,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 30 * 1024 * 1024) {
        reject(new Error("Ukuran request terlalu besar."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function readBinaryBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error("Ukuran audio melebihi batas 8 MB."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function deleteFileIfExists(filePath) {
  if (!filePath) {
    return;
  }

  fs.promises.unlink(filePath).catch(() => {});
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const baseDirectory = requestedPath.startsWith("/uploads/") ? UPLOADS_ROOT : FRONTEND_ROOT;
  const normalizedPath = requestedPath.startsWith("/uploads/")
    ? requestedPath.replace(/^\/uploads\/+/, "")
    : requestedPath.replace(/^\/+/, "");
  const filePath = path.join(baseDirectory, normalizedPath);

  if (!filePath.startsWith(baseDirectory)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      service: "lyricdash-arena",
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.playerName || !body.audioUrl || !body.audioFilePath || !body.lrcText) {
        return sendJson(res, 400, { message: "Data room belum lengkap." });
      }

      const code = createRoomCode();
      const host = createPlayer(body.playerName, true);
      const room = {
        code,
        players: [host],
        assets: {
          audioName: body.audioName || "shared-audio",
          audioType: body.audioType || "audio/mpeg",
          audioUrl: body.audioUrl,
          audioFilePath: body.audioFilePath,
          lrcText: body.lrcText,
        },
        matchStateLabel: "Lobby",
      };

      rooms.set(code, room);
      return sendJson(res, 201, {
        room: summarizeRoom(room),
        player: host,
      });
    } catch (error) {
      return sendJson(res, 400, { message: error.message || "Gagal membuat room." });
    }
  }

  const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/join$/);
  if (req.method === "POST" && joinMatch) {
    try {
      const roomCode = joinMatch[1];
      const room = rooms.get(roomCode);
      if (!room) {
        return sendJson(res, 404, { message: "Room tidak ditemukan." });
      }

      const body = JSON.parse(await readBody(req));
      if (!body.playerName) {
        return sendJson(res, 400, { message: "Nama pemain wajib diisi." });
      }

      const player = createPlayer(body.playerName, false);
      room.players.push(player);
      broadcastRoomState(room);
      return sendJson(res, 200, {
        room: summarizeRoom(room),
        player,
      });
    } catch (error) {
      return sendJson(res, 400, { message: error.message || "Gagal gabung room." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/uploads/audio") {
    try {
      const originalName = sanitizeFilename(req.headers["x-file-name"] || "audio.bin");
      const fileExtension = path.extname(originalName) || ".bin";
      const storedName = `${crypto.randomUUID()}${fileExtension}`;
      const filePath = path.join(UPLOADS_ROOT, storedName);
      const audioBuffer = await readBinaryBody(req, MAX_AUDIO_UPLOAD_BYTES);

      await fs.promises.writeFile(filePath, audioBuffer);

      return sendJson(res, 201, {
        audioName: originalName,
        audioType: req.headers["content-type"] || "application/octet-stream",
        audioUrl: `/uploads/${storedName}`,
        audioFilePath: filePath,
      });
    } catch (error) {
      return sendJson(res, 400, { message: error.message || "Gagal mengunggah audio." });
    }
  }

  sendJson(res, 404, { message: "API tidak ditemukan." });
}

function getPlayerRoom(playerId) {
  for (const room of rooms.values()) {
    const player = room.players.find((entry) => entry.id === playerId);
    if (player) {
      return room;
    }
  }
  return null;
}

function broadcastRoom(room, eventName, payload) {
  io.to(room.code).emit(eventName, payload);
}

function broadcastRoomState(room) {
  broadcastRoom(room, "room_state", {
    room: summarizeRoom(room),
  });
}

function finishMatchIfDone(room) {
  if (!room.players.length) {
    return;
  }

  const everyoneFinished = room.players.every((player) => player.isFinished);
  if (everyoneFinished) {
    room.matchStateLabel = "Selesai";
    broadcastRoom(room, "match_finished", {
      room: summarizeRoom(room),
    });
  }
}

function removePlayer(playerId) {
  playerSockets.delete(playerId);

  rooms.forEach((room, roomCode) => {
    const leavingPlayer = room.players.find((player) => player.id === playerId);
    if (!leavingPlayer) {
      return;
    }

    room.players = room.players.filter((player) => player.id !== playerId);

    if (leavingPlayer.isHost && room.players.length > 0) {
      room.players[0].isHost = true;
    }

    if (room.players.length === 0) {
      deleteFileIfExists(room.assets?.audioFilePath);
      rooms.delete(roomCode);
    } else {
      broadcastRoomState(room);
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  serveStatic(req, res);
});

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  socket.on("register_player", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) {
      socket.emit("error_message", { message: "Room tidak ditemukan." });
      return;
    }

    const player = room.players.find((entry) => entry.id === payload.playerId);
    if (!player) {
      socket.emit("error_message", { message: "Pemain tidak ditemukan." });
      return;
    }

    if (socket.data.playerId && socket.data.playerId !== player.id) {
      removePlayer(socket.data.playerId);
    }

    socket.data.playerId = player.id;
    playerSockets.set(player.id, socket.id);
    socket.join(room.code);

    socket.emit(player.isHost ? "room_created" : "room_joined", {
      room: summarizeRoom(room),
      player,
    });

    broadcastRoomState(room);
  });

  socket.on("start_match", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) {
      return;
    }

    const player = room.players.find((entry) => entry.id === payload.playerId);
    if (!player || !player.isHost) {
      return;
    }

    room.players.forEach((entry) => {
      entry.score = 0;
      entry.accuracy = 100;
      entry.correctWords = 0;
      entry.totalWords = 0;
      entry.combo = 0;
      entry.isFinished = false;
    });

    room.matchStateLabel = "Countdown";
    const startAt = Date.now() + 5000;
    broadcastRoom(room, "match_started", {
      room: summarizeRoom(room),
      startAt,
    });
  });

  socket.on("score_update", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) {
      return;
    }

    const player = room.players.find((entry) => entry.id === payload.playerId);
    if (!player) {
      return;
    }

    player.score = payload.score;
    player.accuracy = payload.accuracy;
    player.correctWords = payload.correctWords;
    player.totalWords = payload.totalWords;
    player.combo = payload.combo;
    room.matchStateLabel = "Match Berjalan";
    broadcastRoomState(room);
  });

  socket.on("player_finished", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) {
      return;
    }

    const player = room.players.find((entry) => entry.id === payload.playerId);
    if (!player) {
      return;
    }

    player.score = payload.score;
    player.accuracy = payload.accuracy;
    player.correctWords = payload.correctWords;
    player.totalWords = payload.totalWords;
    player.isFinished = true;
    room.matchStateLabel = "Menunggu Hasil";
    broadcastRoomState(room);
    finishMatchIfDone(room);
  });

  socket.on("disconnect", () => {
    if (!socket.data.playerId) {
      return;
    }

    const playerId = socket.data.playerId;
    const room = getPlayerRoom(playerId);
    removePlayer(playerId);

    if (room) {
      socket.leave(room.code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`LyricDash server running on http://localhost:${PORT}`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// roomCode -> { users: Map<socketId, {id,name,progress}>, hostId: string, voiceUsers: Set<string> }
const rooms = new Map();
// userId -> socketId (for online friend tracking)
const onlineUsers = new Map();

io.on('connection', socket => {
  let roomCode;
  let userId;

  socket.on('join', ({ room, name, id }) => {
    roomCode = room;
    userId = id;
    if (userId) onlineUsers.set(userId, socket.id);

    if (!rooms.has(room)) {
      rooms.set(room, { users: new Map(), hostId: socket.id, voiceUsers: new Set() });
    }
    const info = rooms.get(room);
    info.users.set(socket.id, { id: socket.id, name: name || 'Guest', progress: 0 });
    socket.join(room);
    io.to(room).emit('users', getUsers(room));
    io.emit('presence', Array.from(onlineUsers.keys()));
  });

  socket.on('presence', ({ id }) => {
    if (!id) return;
    userId = id;
    onlineUsers.set(id, socket.id);
    io.emit('presence', Array.from(onlineUsers.keys()));
  });

  socket.on('chat', msg => {
    if (roomCode) io.to(roomCode).emit('chat', msg);
  });

  socket.on('progress', data => {
    if (!roomCode || typeof data.progress !== 'number') return;
    const info = rooms.get(roomCode);
    if (!info) return;

    if (socket.id === info.hostId) {
      const hostProg = data.progress;
      const hostUser = info.users.get(socket.id);
      if (hostUser) hostUser.progress = hostProg;

      info.users.forEach((user, id) => {
        if (id === info.hostId) return;
        const drift = Math.abs(hostProg - (user.progress || 0));
        if (drift > 5) {
          user.progress = hostProg;
          io.to(id).emit('setprogress', hostProg);
        }
      });
    } else {
      const viewer = info.users.get(socket.id);
      if (viewer) viewer.progress = data.progress;
      io.to(info.hostId).emit('viewerProgress', {
        id: socket.id,
        progress: data.progress
      });
    }
  });

  socket.on('play', () => {
    const info = rooms.get(roomCode);
    if (roomCode && info && socket.id === info.hostId) {
      socket.to(roomCode).emit('play');
    }
  });

  socket.on('pause', () => {
    const info = rooms.get(roomCode);
    if (roomCode && info && socket.id === info.hostId) {
      socket.to(roomCode).emit('pause');
    }
  });

  socket.on('setprogress', val => {
    const info = rooms.get(roomCode);
    if (roomCode && info && socket.id === info.hostId) {
      socket.to(roomCode).emit('setprogress', val);
    }
  });

  socket.on('changeEpisode', data => {
    const info = rooms.get(roomCode);
    if (roomCode && info && socket.id === info.hostId) {
      socket.to(roomCode).emit('changeEpisode', data);
    }
  });

  socket.on('voiceReady', () => {
    const info = rooms.get(roomCode);
    if (!roomCode || !info) return;
    info.voiceUsers.add(socket.id);
    socket.to(roomCode).emit('voiceReady', socket.id);
    // Notify the new user of others already in voice
    info.voiceUsers.forEach(id => {
      if (id !== socket.id) socket.emit('voiceReady', id);
    });
  });

  socket.on('voiceDisable', () => {
    const info = rooms.get(roomCode);
    if (!roomCode || !info) return;
    info.voiceUsers.delete(socket.id);
    socket.to(roomCode).emit('voiceDisable', socket.id);
  });

  socket.on('voiceSignal', ({ target, data }) => {
    if (target) io.to(target).emit('voiceSignal', { from: socket.id, data });
  });

  socket.on('transferHost', newHostId => {
    if (!roomCode) return;
    const info = rooms.get(roomCode);
    if (!info || info.hostId !== socket.id) return;
    const newHost = info.users.get(newHostId);
    if (!newHost) return;
    info.hostId = newHostId;
    io.to(roomCode).emit('users', getUsers(roomCode));
  });

  socket.on('disconnect', () => {
    if (userId) {
      onlineUsers.delete(userId);
      io.emit('presence', Array.from(onlineUsers.keys()));
    }

    if (!roomCode) return;
    const info = rooms.get(roomCode);
    if (!info) return;

    info.users.delete(socket.id);
    info.voiceUsers.delete(socket.id);
    if (socket.id === info.hostId) {
      const next = info.users.values().next().value;
      info.hostId = next ? next.id : null;
    }

    if (info.users.size === 0) {
      rooms.delete(roomCode);
    } else {
      io.to(roomCode).emit('users', getUsers(roomCode));
    }
  });
});

function getUsers(room) {
  const info = rooms.get(room);
  if (!info) return [];
  return Array.from(info.users.values())
    .map(u => ({
      id: u.id,
      name: u.name,
      isHost: u.id === info.hostId,
      progress: u.progress || 0
    }));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Watch party server listening on ${PORT}`);
});

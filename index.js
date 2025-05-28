// server.js
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: '*' } // allow any frontend for dev
});

io.on('connection', (socket) => {
  let room;
  socket.on('join', ({ room: roomId, name }) => {
    room = roomId;
    socket.join(room);
    // Optional: broadcast joined users
    io.to(room).emit('users', Array.from(io.sockets.adapter.rooms.get(room) || []));
  });
  socket.on('sync', (data) => {
    socket.to(room).emit('sync', data); // send to others
  });
  socket.on('chat', (msg) => {
    io.to(room).emit('chat', msg); // broadcast chat
  });
  socket.on('disconnect', () => {
    if (room) {
      io.to(room).emit('users', Array.from(io.sockets.adapter.rooms.get(room) || []));
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Socket.io running on port', PORT));

const http = require('http');
const { Server } = require('socket.io');

// Respond with plain text status for HTTP requests (like a browser)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Watchparty Socket.io server is running 🚀\n");
});

const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  let room;
  socket.on('join', ({ room: roomId, name }) => {
    room = roomId;
    socket.join(room);
    io.to(room).emit('users', Array.from(io.sockets.adapter.rooms.get(room) || []));
  });
  socket.on('sync', (data) => {
    socket.to(room).emit('sync', data);
  });
  socket.on('chat', (msg) => {
    io.to(room).emit('chat', msg);
  });
  socket.on('disconnect', () => {
    if (room) {
      io.to(room).emit('users', Array.from(io.sockets.adapter.rooms.get(room) || []));
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Socket.io running on port', PORT));

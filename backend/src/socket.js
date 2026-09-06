import { Server } from 'socket.io';


let io;

export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    // 1. Check handshake auth or query for automatic room join upon connecting
    const handshakeMerchantId =
      socket.handshake.auth?.merchantId || socket.handshake.query?.merchantId;
    if (handshakeMerchantId) {
      const room = `merchant_${handshakeMerchantId.toString().trim()}`;
      socket.join(room);
      console.log(`[Socket.io] Socket ${socket.id} auto-joined room ${room} via handshake`);
    }

    // 2. Explicit join event handler (handles object or raw string)
    socket.on('join', async (data) => {
      try {
        const rawId = typeof data === 'string' ? data : data?.merchantId;
        if (!rawId) return;

        const room = `merchant_${rawId.toString().trim()}`;
        socket.join(room);
        console.log(`[Socket.io] Socket ${socket.id} joined room ${room}`);
      } catch (err) {
        console.error('[Socket.io] join error:', err.message);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Socket ${socket.id} disconnected: ${reason}`);
    });
  });

  return io;
}

export function emitDashboardUpdate(merchantId, meta = {}) {
  if (!io || !merchantId) return;
  const idStr = merchantId.toString().trim();
  const room = `merchant_${idStr}`;
  const payload = {
    timestamp: Date.now(),
    merchantId: idStr,
    ...meta,
  };

  // 1. Emit targeted event to the merchant's room
  io.to(room).emit('dashboard_update', payload);

  // 2. Also emit merchant_update broadcast (filtered by merchantId on client)
  // as an additional safety net against room join desync
  io.emit('merchant_update', payload);

  console.log(`[Socket.io] Emitted update for merchant ${idStr}:`, meta);
}

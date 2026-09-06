import { io } from 'socket.io-client';
import { useAuthStore } from './store';

const rawUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'https://verbatask-production.up.railway.app';
const SOCKET_URL = rawUrl.replace(/\/+$/, '');

// A singleton socket instance
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 15000,
});

// A helper to initialize the socket connection
export function connectSocket() {
  const merchantId = useAuthStore.getState().merchantId;

  if (!merchantId) {
    if (socket.connected) socket.disconnect();
    return;
  }

  // Pass merchantId in handshake auth
  socket.auth = { merchantId: merchantId.toString() };

  if (!socket.connected) {
    socket.connect();
  } else {
    // If already connected, make sure room is joined
    socket.emit('join', { merchantId: merchantId.toString() });
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}

// Ensure room is joined on connection & reconnection
socket.on('connect', () => {
  const merchantId = useAuthStore.getState().merchantId;
  if (merchantId) {
    socket.emit('join', { merchantId: merchantId.toString() });
  }
});

socket.on('reconnect', () => {
  const merchantId = useAuthStore.getState().merchantId;
  if (merchantId) {
    socket.emit('join', { merchantId: merchantId.toString() });
  }
});

// Subscribe to auth store changes to connect/disconnect automatically
useAuthStore.subscribe((state, prevState) => {
  if (state.merchantId !== prevState?.merchantId) {
    connectSocket();
  }
});

// Init on load
connectSocket();

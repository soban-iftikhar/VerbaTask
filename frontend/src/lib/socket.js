import { io } from 'socket.io-client';
import { useAuthStore } from './store';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://verbatask.railway.internal';

// A singleton socket instance
export const socket = io(SOCKET_URL, {
  autoConnect: false, // We'll connect manually when we have a merchant ID
});

// A helper to initialize the socket connection
export function connectSocket() {
  const merchantId = useAuthStore.getState().merchantId;
  
  if (!merchantId) {
    if (socket.connected) socket.disconnect();
    return;
  }

  if (!socket.connected) {
    socket.connect();
  }

  socket.on('connect', () => {
    socket.emit('join', { merchantId });
  });
}

// We can subscribe to auth store changes to connect/disconnect automatically
useAuthStore.subscribe((state, prevState) => {
  if (state.merchantId !== prevState?.merchantId) {
    connectSocket();
  }
});

// Init on load
connectSocket();

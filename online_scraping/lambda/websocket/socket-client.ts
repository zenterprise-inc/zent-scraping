import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from './events';

export class SocketClient {
  private socket: Socket | null = null;

  constructor(private token: string) {}

  connect() {
    if (this.socket) return this.socket;

    this.socket = io('http://localhost:3000/chat', {
      transports: ['websocket'],
      extraHeaders: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return this.socket;
  }

  sendMessage(message: string) {
    if (!this.socket) throw new Error('Socket not connected');
    this.socket.emit(SOCKET_EVENTS.SEND_MESSAGE, { message });
  }

  onMessage(cb: (msg: any) => void) {
    if (!this.socket) throw new Error('Socket not connected');
    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE, cb);
  }

  joinRoom(room: string) {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit(SOCKET_EVENTS.JOIN_ROOM, { room });
  }

  leaveRoom(room: string) {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit(SOCKET_EVENTS.LEAVE_ROOM, { room });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

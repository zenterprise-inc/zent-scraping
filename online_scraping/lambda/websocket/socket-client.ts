import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from './events';
import { OnlineMall } from '../online_mall';
import { ScrapingMessage } from '../model/scraping-message.type';

const WS_AUTH_TOKEN = process.env.WS_AUTH_TOKEN || '';

interface WaitForEventResult<T = any> {
  ok: boolean;
  timeout?: boolean;
  data?: T;
  error?: any;
}

export class SocketClient {
  private socket: Socket | null = null;
  private onlineMall: OnlineMall;
  private readonly userId: string;
  private readonly bizNo: string;

  constructor(onlineMall: OnlineMall, userId: string, bizNo: string) {
    this.onlineMall = onlineMall;
    this.userId = userId;
    this.bizNo = bizNo;
  }

  connect() {
    if (this.socket) return this.socket;

    this.socket = io('http://localhost:3000', {
      transports: ['websocket'],
      extraHeaders: {
        Authorization: `Bearer ${WS_AUTH_TOKEN}`,
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

  sendMessage(message: ScrapingMessage) {
    if (!this.socket) throw new Error('Socket not connected');
    this.socket.emit(SOCKET_EVENTS.MESSAGE, message);
  }

  onMessage(cb: (msg: any) => void) {
    if (!this.socket) throw new Error('Socket not connected');
    this.socket.on(SOCKET_EVENTS.MESSAGE, cb);
  }

  waitForEvent<T = any>(
    event: string,
    timeoutMs = 5000,
  ): Promise<WaitForEventResult<T>> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout;

      this.socket!.once(event, (data: T) => {
        clearTimeout(timer);
        resolve({ ok: true, data });
      });

      timer = setTimeout(() => {
        this.socket!.off(event);
        resolve({ ok: false, timeout: true });
      }, timeoutMs);
    });
  }

  joinRoom() {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      appCode: this.onlineMall.toString(),
      userId: this.userId,
      bsno: this.bizNo,
    });
  }

  leaveRoom() {
    if (!this.socket) throw new Error('Socket not connected');

    this.socket.emit(SOCKET_EVENTS.LEAVE_ROOM, {
      appCode: this.onlineMall.toString(),
      userId: this.userId,
      bsno: this.bizNo,
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

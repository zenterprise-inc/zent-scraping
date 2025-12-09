import { io, Socket } from 'socket.io-client';
import { WS_EVENTS } from './ws-events';
import { OnlineMall } from '../online_mall';
import { ScrapingMessage } from '../model/scraping-message.type';

const WS_AUTH_TOKEN = process.env.WS_AUTH_TOKEN || '';
const CARE_WS_SERVER = process.env.CARE_WS_SERVER || 'http://localhost:3000';

interface WaitForEventResult<T = any> {
  ok: boolean;
  timeout?: boolean;
  data?: T;
  error?: any;
}

export class SocketClient {
  private socket: Socket | null = null;
  private readonly userId: string;
  private readonly bizNo: string;
  private readonly onlineMallName: string;

  constructor(onlineMall: OnlineMall, userId: string, bizNo: string) {
    this.userId = userId;
    this.bizNo = bizNo;

    this.onlineMallName = Object.keys(OnlineMall).find(
      key => OnlineMall[key as keyof typeof OnlineMall] === onlineMall
    ) as keyof typeof OnlineMall;
  }

  connect() {
    if (this.socket) return this.socket;

    this.socket = io(CARE_WS_SERVER, {
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
    this.socket.emit(WS_EVENTS.SEND_MESSAGE, {
      appCode: this.onlineMallName,
      userId: this.userId,
      bsno: this.bizNo,
      message: message
    });
  }

  onMessage(cb: (msg: any) => void) {
    if (!this.socket) throw new Error('Socket not connected');
    this.socket.on(WS_EVENTS.MESSAGE, cb);
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
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    console.log(`Joining room: ${this.onlineMallName} / ${this.userId} / ${this.bizNo}`);
    this.socket.emit(WS_EVENTS.JOIN_ROOM, {
      appCode: this.onlineMallName,
      userId: this.userId,
      bsno: this.bizNo,
    });
  }

  leaveRoom() {
    if (!this.socket) { 
      throw new Error('Socket not connected');
    }

    console.log(`Leaving room: ${this.onlineMallName} / ${this.userId} / ${this.bizNo}`);
    this.socket.emit(WS_EVENTS.LEAVE_ROOM, {
      appCode: this.onlineMallName,
      userId: this.userId,
      bsno: this.bizNo,
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

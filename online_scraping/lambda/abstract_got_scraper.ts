import { OnlineMall } from './online_mall';
import { RedisClient } from './redis';
import { AppDataSource } from './db/datasource';
import { DBLogger } from './db_logger';
import { SocketClient } from './websocket/socket-client';
import { ScrapingMessage } from './model/scraping-message.type';
import { WS_EVENTS } from './websocket/ws-events';

const isDocker = process.env.IS_DOCKER === 'true';

export abstract class AbstractGotScraper {
  protected redisClient: RedisClient;
  protected socketClient: SocketClient;
  protected dbLogger: DBLogger;

  protected constructor(onlineMall: OnlineMall, userId: string, bizNo: string) {
    this.redisClient = new RedisClient(onlineMall, userId, bizNo);
    this.socketClient = new SocketClient(onlineMall, userId, bizNo);
    this.dbLogger = new DBLogger(onlineMall, userId, bizNo, this.redisClient);
  }

  async init(): Promise<void> {
    await this.redisClient.connect();
    this.socketClient.connect();
    this.socketClient.joinRoom();
    await AppDataSource.initialize();
  }

  abstract process(): Promise<any>;

  async close(): Promise<void> {
    await this.redisClient.quit();
    this.socketClient.leaveRoom();
    this.socketClient.disconnect();
    await AppDataSource.destroy();
  }

  async sendMessage(message: ScrapingMessage): Promise<void> {
    const curTimestamp = Date.now();
    message.timestamp = curTimestamp;
    this.socketClient.sendMessage(message);
    await this.redisClient.lpush(message);
  }

  async waitMessage(timeoutInSec: number): Promise<ScrapingMessage | null> {
    const result = await this.socketClient.waitForEvent<ScrapingMessage>(
      WS_EVENTS.MESSAGE,
      timeoutInSec * 1000,
    );
    if (!result.ok) {
      if (result.timeout) {
        console.log('response timeout!');
      } else {
        console.log('기타 오류', result.error);
      }
      return null;
    }

    if (!result.data) {
      return null;
    }

    await this.redisClient.lpush(result.data);

    return result.data;
  }

  async run(): Promise<any> {
    await this.init();
    const data = await this.process();
    await this.close();
    return data;
  }
}

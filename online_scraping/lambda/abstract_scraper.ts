import { ScrapeWright } from './scrape_wright';
import { OnlineMall } from './online_mall';
import { RedisClient } from './redis';
import { AppDataSource } from './db/datasource';
import { DBLogger } from './db_logger';
import { promises as fs } from 'fs';
import { Log } from './log';
import { SocketClient } from './websocket/socket-client';
import { ScrapingMessage } from './model/scraping-message.type';
import { WS_EVENTS } from './websocket/ws-events';

const isDocker = process.env.IS_DOCKER === 'true';

export abstract class AbstractScraper {
  protected scrapeWright!: ScrapeWright;
  protected redisClient: RedisClient;
  protected socketClient: SocketClient;
  protected dbLogger: DBLogger;
  private readonly recordVideo: boolean = false;

  protected constructor(
    onlineMall: OnlineMall,
    userId: string,
    bizNo: string,
    recordVideo: boolean = false,
  ) {
    this.scrapeWright = new ScrapeWright();
    this.redisClient = new RedisClient(onlineMall, userId, bizNo);
    this.socketClient = new SocketClient(onlineMall, userId, bizNo);
    this.dbLogger = new DBLogger(onlineMall, userId, bizNo, this.redisClient);
    this.recordVideo = recordVideo;
  }

  async init(): Promise<void> {
    await this.scrapeWright.init(this.recordVideo);
    await this.redisClient.connect();
    this.socketClient.connect();
    this.socketClient.joinRoom();
    await AppDataSource.initialize();
  }

  abstract process(): Promise<any>;

  async close(): Promise<void> {
    await this.scrapeWright.close();
    if (this.recordVideo) {
      await this.saveVideo();
    }
    await this.redisClient.quit();
    this.socketClient.leaveRoom();
    this.socketClient.disconnect();
    await AppDataSource.destroy();
  }

  async saveVideo(): Promise<void> {
    const videoPath = await this.scrapeWright.getVideoPath();
    if (videoPath) {
      const MEDIUMBLOB_MAX_SIZE = 16 * 1024 * 1024 - 1;

      try {
        const stats = await fs.stat(videoPath);
        const fileSize = stats.size;

        console.log(
          `video file size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`,
        );

        if (fileSize > MEDIUMBLOB_MAX_SIZE) {
          await fs.unlink(videoPath);
          return;
        }

        const buffer = await fs.readFile(videoPath);
        await this.dbLogger.writeLog(Log.VIDEO, buffer);

        await fs.unlink(videoPath);
      } catch (error) {
        console.error('saving video error:', error);
      }
    }
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
    //if (isDocker) {
    await this.close();
    //}
    return data;
  }
}

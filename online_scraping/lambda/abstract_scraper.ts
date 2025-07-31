import { ScrapeWright } from './scrape_wright';
import { OnlineMall } from './online_mall';
import { RedisClient } from './redis';
import { AppDataSource } from './db/datasource';
import { DBLogger } from './db_logger';
import { promises as fs } from 'fs';
import { Log } from './log';

const isDocker = process.env.IS_DOCKER === 'true';

export abstract class AbstractScraper {
  protected scrapeWright!: ScrapeWright;
  protected redisClient: RedisClient;
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
    this.dbLogger = new DBLogger(onlineMall, userId, bizNo, this.redisClient);
    this.recordVideo = recordVideo;
  }

  async init(): Promise<void> {
    await this.scrapeWright.init(this.recordVideo);
    await this.redisClient.connect();
    await AppDataSource.initialize();
  }

  abstract process(): Promise<any>;

  async close(): Promise<void> {
    await this.scrapeWright.close();
    if (this.recordVideo) {
      await this.saveVideo();
    }
    await this.redisClient.quit();
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

  async run(): Promise<any> {
    await this.init();
    const data = await this.process();
    //if (isDocker) {
    await this.close();
    //}
    return data;
  }
}

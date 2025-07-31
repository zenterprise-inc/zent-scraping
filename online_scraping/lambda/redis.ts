import { createClient } from 'redis';
import { OnlineMall } from './online_mall';
import { Log } from './log';

console.log('ENV REDIS_URL:', process.env.REDIS_URL);
const REDIS_URL = process.env.REDIS_URL || 'redis://3.35.20.76:6379';
const isTls = REDIS_URL.startsWith('rediss://');

console.log('REDIS_URL:', REDIS_URL);

export class RedisClient {
  private client;
  private onlineMall: OnlineMall;
  private readonly userId: string;
  private readonly bizNo: string;

  constructor(onlineMall: OnlineMall, userId: string, bizNo: string) {
    this.client = createClient({
      url: REDIS_URL,
      socket: {
        tls: isTls,
      },
    });
    this.client.on('error', (err) => console.error('Redis Client Error', err));

    this.onlineMall = onlineMall;
    this.userId = userId;
    this.bizNo = bizNo;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async ensureConnected(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  getLoginKey(): string {
    return `${this.getBznavKey()}:Login`;
  }

  getNaverLoginKey(): string {
    return `${this.getBznavKey()}:NaverLogin`;
  }

  getNaverCommerceLoginKey(): string {
    return `${this.getBznavKey()}:NaverCommerceLogin`;
  }

  getCheckBizNoKey(): string {
    return `${this.getBznavKey()}:CheckBizNo`;
  }

  getSubAccountKey(): string {
    return `${this.getBznavKey()}:SubAccount`;
  }

  getSubUserIdKey(): string {
    return `${this.getBznavKey()}:SubUserId`;
  }

  getSubPasswordKey(): string {
    return `${this.getBznavKey()}:SubPassword`;
  }

  getChannelNoKey(): string {
    return `${this.getBznavKey()}:ChannelNo`;
  }

  getVatDataKey(): string {
    return `${this.getBznavKey()}:VatData`;
  }

  getBznavKey(): string {
    return `BZNAV:${this.onlineMall.toString()}:${this.userId}:${this.bizNo}`;
  }

  getLambdaKey(): string {
    return `LAMBDA:${this.onlineMall.toString()}:${this.userId}:${this.bizNo}`;
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async setNx(key: string, value: string, timeoutInMs: number): Promise<any> {
    return await this.client.set(key, value, {
      NX: true,
      PX: timeoutInMs,
    });
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async lpush(json: any): Promise<number> {
    await this.ensureConnected();
    const curTimestamp = Date.now();
    json.timestamp = curTimestamp;
    await this.client.lPush(this.getBznavKey(), JSON.stringify(json));
    return curTimestamp;
  }

  async brpopJson(key: string, timeout: number): Promise<any> {
    const res = await this.client.brPop(key, timeout);
    if (!res || !res.element) {
      return null;
    }

    const json = JSON.parse(res.element);

    return json;
  }

  async brpopAfterCurTs(
    key: string,
    timeout: number,
    curTimestamp: number,
  ): Promise<any> {
    while (true) {
      const res = await this.brpopJson(key, timeout);
      if (!res) {
        return null;
      }

      if (res.timestamp >= curTimestamp) {
        return res;
      }
    }
  }

  async brpop(timeout: number, curTimestamp: number): Promise<any> {
    return await this.brpopAfterCurTs(
      this.getLambdaKey(),
      timeout,
      curTimestamp,
    );
  }

  async brpopInCoupangSMS(
    index: number,
    timeout: number,
    curTimestamp: number,
  ): Promise<any> {
    return await this.brpopAfterCurTs(
      `coupangSMS${index}`,
      timeout,
      curTimestamp,
    );
  }

  async getNextId(): Promise<number> {
    const id = await this.client.incr('coupang:subaccount:id');
    return id;
  }

  getSubAccountNumberKey(index: number): string {
    return `subAccountNumber:${index}`;
  }

  async getSubAccountNumber(index: number): Promise<number> {
    const key = this.getSubAccountNumberKey(index);
    const value = await this.client.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  async incrSubAccountNumber(index: number): Promise<void> {
    const key = this.getSubAccountNumberKey(index);
    await this.client.incr(key);
  }

  async setLastStatus(log: Log) {
    const key = `${this.getBznavKey()}:LastStatus`;
    await this.client.set(key, log.toString());
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}

export enum OperationType {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  INVALID_SMS = 'INVALID_SMS',
  INVALID_EMAIL = 'INVALID_EMAIL',
  APP_CONFIRM = 'APP_CONFIRM',
  CAPTCHA = 'CAPTCHA',
  RESEND_SMS = 'RESEND_SMS',
  RESEND_EMAIL = 'RESEND_EMAIL',
  TERMINATE = 'TERMINATE',
}

export enum StatusType {
  APP_CONFIRM_SUCCESS = 'APP_CONFIRM_SUCCESS',
  SMS_SUCCESS = 'SMS_SUCCESS',
  WRONG_ACCOUNT = 'WRONG_ACCOUNT',
  SUSPENDED_ACCOUNT = 'SUSPENDED_ACCOUNT',
  LINK_FAILURE = 'LINK_FAILURE',
  MISMATCH_BIZ_NO = 'MISMATCH_BIZ_NO',
  REQUIRE_MAIN_ACCOUNT = 'REQUIRE_MAIN_ACCOUNT',
  AUTH_TIMEOUT = 'AUTH_TIMEOUT',
  TIMEOUT = 'TIMEOUT',
  MAX_RESEND_REACHED = 'MAX_RESEND_REACHED',
  START_COMMERCE_LOGIN = 'START_COMMERCE_LOGIN',
  TEMPORARY_ERROR = 'TEMPORARY_ERROR',
  COMPLETED = 'COMPLETED',
}

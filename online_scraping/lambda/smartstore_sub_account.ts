import { AbstractSmartStore } from './abstract_smartstore';
import { OnlineMall } from './online_mall';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Log } from './log';
import { DetailStatusEnum } from './db_logger';
import { promises as fs } from 'fs';
import { join } from 'path';

const sqs = new SQSClient({ region: 'ap-northeast-2' });
const queueUrl =
  'https://sqs.ap-northeast-2.amazonaws.com/778510488153/InviteReceiverStack-InviteReceiverQueue68AAF44D-g4a2kxLUJkNa';

export class SmartStoreSubAccount extends AbstractSmartStore {
  constructor(
    onlineMall: OnlineMall,
    userId: string,
    password: string,
    bizNo: string,
  ) {
    super(onlineMall, userId, password, bizNo, false);
  }

  async createSubAccount(): Promise<any> {
    while (true) {
      const data = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        }),
      );

      if (data.Messages && data.Messages.length > 0) {
        for (const message of data.Messages) {
          console.log('Received message:', message.Body);
          if (message.Body === undefined) {
            continue;
          }

          const success = await this.loginCommerce();
          if (!success) {
            console.error('Login failed');
            await this.scrapeWright.close();
            await this.scrapeWright.init();
          }

          const inviteUrl = message.Body;
          await this.dbLogger.writeLogWithInfo(
            Log.NAVER_COMMERCE_GET_INVITE_URL,
            message.Body,
          );
          await this.scrapeWright.goto(inviteUrl);
          await this.scrapeWright.waitForTimeout(2000);

          if (
            await this.scrapeWright.exists(
              '//p[contains(text(), "유효하지 않은 초대입니다")]',
            )
          ) {
            await this.dbLogger.writeLogWithInfo(
              Log.NAVER_COMMERCE_INVALID_INVITE,
              inviteUrl,
            );
            await this.deleteMessage(message);
            continue;
          }

          await this.scrapeWright.click(
            '//a[@class="btn btn-xlg btn-default btn-block"]',
          );

          await this.scrapeWright.waitForTimeout(2000);

          if (
            !(await this.scrapeWright.exists(
              '//button[@type="button" and contains(@class, "Login_btn_login")]',
            )) &&
            (await this.scrapeWright.exists(
              '//input[@placeholder="아이디 또는 이메일 주소"]',
            ))
          ) {
            await this.loginCommerce();
            continue;
          }

          await this.scrapeWright.click(
            '//button[@type="button" and contains(@class, "Login_btn_login")]',
          );
          await this.dbLogger.writeLog(Log.NAVER_COMMERCE_CLICK_ACCOUNT_BTN);
          await this.scrapeWright.waitForTimeout(2000);

          if (
            await this.scrapeWright.exists(
              '//p[contains(text(), "스토어의 권한이 부여")]',
            )
          ) {
            await this.dbLogger.writeLog(Log.NAVER_COMMERCE_INVITE_SUCCESS);
            await this.scrapeWright.click(
              '//a[contains(text(), "스마트스토어센터로")]',
            );

            await this.updateOnlineMallAccount(inviteUrl);
          } else {
            await this.dbLogger.writeLogWithInfo(
              Log.NAVER_COMMERCE_INVITE_FAILURE,
              this.scrapeWright.url(),
            );

            const filePath = join(process.cwd(), 'failed_invite_urls.txt');
            await fs.appendFile(filePath, inviteUrl + '\n', 'utf8');
          }

          await this.deleteMessage(message);

          await this.scrapeWright.close();
          await this.scrapeWright.init();
        }
      }
    }

    return true;
  }

  async updateOnlineMallAccount(inviteUrl: string): Promise<boolean> {
    console.log('사업자번호를 체크합니다. 잠시 기다려주세요...');
    await this.scrapeWright.waitForTimeout(2000);

    const headers = {
      'Content-Type': 'application/json',
      Origin: 'https://sell.smartstore.naver.com',
      Referer: 'https://sell.smartstore.naver.com/',
    };

    const res = await this.scrapeWright.get(
      'https://sell.smartstore.naver.com/api/sellers/account?maskApplyTypes=MEMBER&maskApplyTypes=SETTLEMENT',
      headers,
    );

    if (!res || !res.represent || !res.represent.identity) {
      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_COMMERCE_FAIL_TO_GET_SELLER_INFO,
        res,
      );
      return false;
    }
    await this.dbLogger.writeLog(Log.NAVER_COMMERCE_REQUEST_SELLER_INFO);
    const siteBizNo = res.represent.identity;
    console.log(`사업자번호: --${siteBizNo}--`);

    await this.dbLogger.updateSmartStoreDetailStatus(
      siteBizNo,
      DetailStatusEnum.SUCCEED_TO_CREATE_SUB_ACCOUNT,
    );

    return true;
  }

  async deleteMessage(message: Message): Promise<void> {
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle!,
      }),
    );
  }

  async process(): Promise<any> {
    const data = await this.createSubAccount();
    return data;
  }
}

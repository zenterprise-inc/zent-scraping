import { Log } from './log';
import { ScrapingLog } from './db/scraping_log.entity';
import { AppDataSource } from './db/datasource';
import { OnlineMall } from './online_mall';
import { RedisClient } from './redis';
import { OnlineMallAccount } from './db/online-mall-account.entity';
import { VatDeclare } from './db/vat-declare.entity';
import { OnlineMallScrapingResult } from './db/online-mall-scraping-result.entity';
import { OnlineMallScrapingHistory } from './db/online-mall-scraping-history.entity';
import { ProCareApi } from './pro-care-api';
import { OnlineMallStore } from './db/online-mall-store.entity';

const FE_LOGS = [
  Log.NAVER_START_LOGIN,
  Log.NAVER_WRONG_ACCOUNT,
  Log.NAVER_REQUIRE_2FA_AUTH,
  Log.NAVER_2FA_AUTH_TIMEOUT,
  Log.NAVER_2FA_AUTH_RESEND,
  Log.NAVER_COMMERCE_WRONG_ACCOUNT,
  Log.NAVER_COMMERCE_CAPTCHA_SUCCESS,
  Log.NAVER_COMMERCE_BIZ_NO_NOT_MATCHED,

  Log.COUPANG_START_LOGIN,
  Log.COUPANG_WRONG_ACCOUNT,
  Log.COUPANG_START_MFA_AUTH,
  Log.COUPANG_TRY_MFA_AUTH,
  Log.COUPANG_MFA_AUTH_TIMEOUT,
  Log.COUPANG_MFA_AUTH_INVALID,
  Log.COUPANG_MFA_AUTH_RESNED,
  Log.COUPANG_MFA_AUTH_REACH_MAX_TRY_CNT,
  Log.COUPANG_MFA_AUTH_APPROVED,
  Log.COUPANG_REDIRECT_TO_WING,
  Log.COUPANG_BIZ_NO_NOT_MATCHED,
];

export class DBLogger {
  private onlineMall: OnlineMall;
  private readonly userId: string;
  private readonly bizNo: string;
  private redisClient: RedisClient;

  constructor(
    onlineMall: OnlineMall,
    userId: string,
    bizNo: string,
    redisClient: RedisClient,
  ) {
    this.onlineMall = onlineMall;
    this.userId = userId;
    this.bizNo = bizNo;
    this.redisClient = redisClient;
  }

  async writeLog(log: Log, image?: any): Promise<void> {
    await this.write(log, image);
  }

  async writeLogWithInfo(log: Log, info: string, image?: any): Promise<void> {
    await this.write(`${log}, ${info}`, image);
  }

  async write(log: any, image?: any): Promise<void> {
    console.log(`LOG: ${log}`);
    if (FE_LOGS.includes(log)) {
      await this.redisClient.setLastStatus(log);
    }

    const scrapingLog = new ScrapingLog();
    scrapingLog.onlineMall = this.onlineMall.toString();
    scrapingLog.userId = this.userId;
    scrapingLog.bizNo = this.bizNo;
    scrapingLog.log = log.slice(0, 254);
    scrapingLog.createdAt = new Date();

    if (image) {
      //scrapingLog.image = image;
      if (Buffer.isBuffer(image)) {
        scrapingLog.imgBase64 = image.toString('base64');
      } else {
        scrapingLog.imgBase64 = image;
      }

      scrapingLog.image = undefined;
    }

    await this.redisClient.lpushLog(scrapingLog);
    // await AppDataSource.manager.save(scrapingLog);
  }

  async updateSmartStoreDetailStatus(
    bizNo: string,
    detailStatusEnum: DetailStatusEnum,
  ): Promise<void> {
    await AppDataSource.manager.update(
      OnlineMallAccount,
      {
        bizNo: bizNo,
        mallType: OnlineMall.SmartStore.toString(),
        status: 'complete',
      },
      { detailStatus: detailStatusEnum },
    );
  }

  async updateSmartStoreChannelNo(
    bizNo: string,
    channelNo: string,
  ): Promise<void> {
    await AppDataSource.manager.update(
      OnlineMallAccount,
      {
        bizNo: bizNo,
        mallType: OnlineMall.SmartStore.toString(),
        status: 'complete',
      },
      { storeId: channelNo },
    );
  }

  async getOnlineMallAccountsByMallTypeAndScrapingTime(
    mallType: string,
    compareTime: Date,
    comparison: 'before' | 'after' | 'equal' = 'before',
  ): Promise<OnlineMallAccount[]> {
    const queryBuilder = AppDataSource.manager
      .createQueryBuilder(OnlineMallAccount, 'account')
      .where('account.mallType = :mallType', { mallType })
      .andWhere('account.status = :status', { status: 'complete' })
      .andWhere('account.detailStatus = :detailStatus', {
        detailStatus: 'SUCCEED_TO_CREATE_SUB_ACCOUNT',
      });

    switch (comparison) {
      case 'before':
        queryBuilder.andWhere('account.lastSuccessScrapingAt < :compareTime', {
          compareTime,
        });
        break;
      case 'after':
        queryBuilder.andWhere('account.lastSuccessScrapingAt > :compareTime', {
          compareTime,
        });
        break;
      case 'equal':
        queryBuilder.andWhere('account.lastSuccessScrapingAt = :compareTime', {
          compareTime,
        });
        break;
    }

    return await queryBuilder.getMany();
  }

  async getVatDeclare(
    bmanTin: string,
    year: number,
    half: string,
  ): Promise<VatDeclare | null> {
    return await AppDataSource.manager.findOne(VatDeclare, {
      where: {
        bmanTin: bmanTin,
        year: year.toString(),
        half: half,
      },
    });
  }

  async updateSuccesfulScrapingStatus(
    onlineMallAccount: OnlineMallAccount,
    vatDeclare: VatDeclare,
    vatDataArr: any,
    startYm: string,
    endYm: string,
  ): Promise<number | undefined> {
    const onlineMallScrapingResult = await AppDataSource.manager.findOne(
      OnlineMallScrapingResult,
      {
        where: {
          vatDeclareId: vatDeclare.id,
          onlineMallAccountId: onlineMallAccount.id,
        },
      },
    );

    let resultId: number | undefined;
    if (onlineMallScrapingResult) {
      await AppDataSource.manager.update(
        OnlineMallScrapingResult,
        { id: onlineMallScrapingResult.id },
        {
          result: vatDataArr,
          status: 'complete',
        },
      );
      resultId = onlineMallScrapingResult.id;
    } else {
      const insertResult = await AppDataSource.manager.insert(
        OnlineMallScrapingResult,
        {
          svcCd: '',
          vatDeclareId: vatDeclare.id,
          onlineMallAccountId: onlineMallAccount.id,
          result: vatDataArr,
          startDate: startYm,
          endDate: endYm,
          status: 'complete',
        },
      );
      resultId = insertResult.identifiers?.[0]?.id;
    }

    await AppDataSource.manager.insert(OnlineMallScrapingHistory, {
      svcCd: '',
      onlineMallAccountId: onlineMallAccount.id,
      result: vatDataArr,
      message: '',
      startDate: startYm,
      endDate: endYm,
      status: 'complete',
    });

    const vatPayload = {
      vatDeclareId: vatDeclare.id,
      onlineMallScrapingResultId: resultId,
      data: {
        bsno: onlineMallAccount.bizNo,
        mallType: onlineMallAccount.mallType,
        storeName: '',
        vat: vatDataArr,
      },
    };

    const proCareApi = new ProCareApi();
    const proResult = await proCareApi.sendScrapedVatData(vatPayload);

    if (proResult) {
      await AppDataSource.manager.update(
        OnlineMallAccount,
        { id: onlineMallAccount.id },
        { lastSuccessScrapingAt: new Date() },
      );
    }

    return resultId;
  }

  async getOnlineMallStoresByAccountId(
    onlineMallAccountId: number,
  ): Promise<OnlineMallStore[]> {
    return await AppDataSource.manager.find(OnlineMallStore, {
      where: {
        onlineMallAccountId: onlineMallAccountId,
      },
    });
  }
}

export enum DetailStatusEnum {
  FAIL_TO_LOGIN = 'FAIL_TO_LOGIN',
  NO_SUB_USER_ID = 'NO_SUB_USER_ID',
  NO_SUB_PASSWORD = 'NO_SUB_PASSWORD',
  NOT_MATCHED_BIZ_NO = 'NOT_MATCHED_BIZ_NO',
  FAIL_TO_REQUEST_SUB_ACCOUNT = 'FAIL_TO_REQUEST_SUB_ACCOUNT',
  FAIL_TO_CREATE_SUB_ACCOUNT = 'FAIL_TO_CREATE_SUB_ACCOUNT',
  SUCCEED_TO_CREATE_SUB_ACCOUNT = 'SUCCEED_TO_CREATE_SUB_ACCOUNT',
}

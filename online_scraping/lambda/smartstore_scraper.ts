import { OnlineMall } from './online_mall';
import { AbstractSmartStore } from './abstract_smartstore';
import { Log } from './log';
import { StatusType } from './redis';

export class SmartStoreScraper extends AbstractSmartStore {
  private readonly isNaverAccount: boolean;

  constructor(
    isNaverAccount: boolean,
    userId: string,
    password: string,
    bizNo: string,
    subAccountName: string,
    subAccountPhoneNumber: string,
    includeVat?: boolean,
    startYm?: string,
    endYm?: string,
  ) {
    super(
      OnlineMall.SmartStore,
      userId,
      password,
      bizNo,
      subAccountName,
      subAccountPhoneNumber,
      includeVat,
      startYm,
      endYm,
      true,
    );

    this.isNaverAccount = isNaverAccount;
  }

  async process(): Promise<any> {
    const data = {
      action: false,
      type: StatusType.TIMEOUT.toString(),
    };
    let timeoutId = setTimeout(
      async () => {
        await this.redisClient.lpush(data);
      },
      10 * 60 * 1000,
    );

    try {
      const loginSuccess = this.isNaverAccount
        ? await this.loginNaver()
        : await this.loginCommerce();

      const accessSuccess = loginSuccess
        ? await this.checkSmartStoreAccess()
        : false;
      if (!accessSuccess) {
        const buffer = await this.scrapeWright.screenshotFullPage();
        await this.dbLogger.writeLog(Log.FAILED, buffer);
        return false;
      }

      const matchedBizNo = await this.checkBizNo();

      return matchedBizNo;
    } catch (e) {
      await this.redisClient.lpush({
        action: false,
        type: StatusType.TEMPORARY_ERROR.toString(),
      });
      await this.dbLogger.writeLogWithInfo(
        Log.TEMPORARY_ERROR,
        e instanceof Error ? e.message : String(e),
      );
      return false;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

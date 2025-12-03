import { OnlineMall } from './online_mall';
import { AbstractSmartStore } from './abstract_smartstore';
import { Log } from './log';
import { StatusType } from './redis';
import { getEndYearMonth, getStartYearMonth } from './date_util';

export class SmartStoreScraper extends AbstractSmartStore {
  private readonly isNaverAccount: boolean;
  private readonly includeVat: boolean;
  private readonly startYm: string;
  private readonly endYm: string;

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
      true,
    );

    this.isNaverAccount = isNaverAccount;
    this.includeVat = includeVat || false;
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
  }

  async process(): Promise<any> {
    const data = {
      action: false,
      type: StatusType.TIMEOUT,
    };
    let timeoutId = setTimeout(
      async () => {
        await this.sendMessage(data);
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

      const matchedBizNo = await this.checkBizNo(
        this.startYm,
        this.endYm,
        this.includeVat,
      );

      return matchedBizNo;
    } catch (e) {
      await this.sendMessage({
        action: false,
        type: StatusType.TEMPORARY_ERROR,
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

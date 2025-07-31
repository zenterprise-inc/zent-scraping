import { OnlineMall } from './online_mall';
import { AbstractCoupang } from './abstract_coupang';
import {
  getEndYearMonth,
  getStartYearMonth,
  getVatHalf,
  getVatYear,
} from './date_util';
import { Kms } from './kms';

export class CoupangVat extends AbstractCoupang {
  private readonly startYm: string;
  private readonly endYm: string;

  constructor(
    onlineMall: OnlineMall,
    userId: string,
    password: string,
    bizNo: string,
    startYm?: string,
    endYm?: string,
  ) {
    super(onlineMall, userId, password, bizNo);
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
  }

  async loginSubAccountAndScrapeVat(): Promise<any> {
    const beforeJuly = new Date(new Date().getFullYear(), 6, 2);

    const onlineMallAccounts =
      await this.dbLogger.getOnlineMallAccountsByMallTypeAndScrapingTime(
        OnlineMall.Coupang,
        beforeJuly,
        'before',
      );

    const kms = new Kms();
    for (const onlineMallAccount of onlineMallAccounts) {
      const vatDeclare = await this.dbLogger.getVatDeclare(
        onlineMallAccount.bmanTin,
        getVatYear(),
        getVatHalf(),
      );

      if (!vatDeclare) {
        continue;
      }

      const userId = onlineMallAccount.subUserId;

      if (!userId || !onlineMallAccount.subPassword) {
        continue;
      }

      const password = await kms.decrypt(onlineMallAccount.subPassword);

      const loginSuccess = await this.loginSubAccount(userId, password);
      if (!loginSuccess) {
        continue;
      }
      const vatData = await this.scrapeVat(this.startYm, this.endYm);
      if (vatData) {
        await this.dbLogger.updateSuccesfulScrapingStatus(
          onlineMallAccount,
          vatDeclare,
          [vatData],
          this.startYm,
          this.endYm,
        );
      }

      console.log('logout');
      await this.scrapeWright.goto('https://wing.coupang.com/logout');
      await this.scrapeWright.waitForTimeout(2000);
    }
  }

  async process(): Promise<any> {
    const data = await this.loginSubAccountAndScrapeVat();
    return data;
  }
}

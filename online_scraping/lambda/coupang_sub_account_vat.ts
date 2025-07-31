import { OnlineMall } from './online_mall';
import { AbstractCoupang } from './abstract_coupang';
import { getEndYearMonth, getStartYearMonth } from './date_util';

export class CoupangSubAccountVat extends AbstractCoupang {
  private readonly startYm: string;
  private readonly endYm: string;

  constructor(
    userId: string,
    password: string,
    startYm?: string,
    endYm?: string,
  ) {
    super(OnlineMall.Coupang, userId, password, '0000000000');
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
  }

  async process(): Promise<any> {
    const loginSuccess = await this.loginSubAccount(this.userId, this.password);
    if (!loginSuccess) {
      return false;
    }
    const data = await this.scrapeVat(this.startYm, this.endYm);
    return data;
  }
}

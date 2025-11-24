import { OnlineMall } from './online_mall';
import { Log } from './log';
import { StatusType } from './redis';
import { getEndYearMonth, getStartYearMonth } from './date_util';
import { AbstractSmartStoreLogin } from './abstract_smartstore_login';

export class SmartPlaceScraper extends AbstractSmartStoreLogin {
  private readonly subAccountName: string;
  private readonly subAccountPhoneNumber: string;
  private readonly includeVat: boolean;
  private readonly startYm: string;
  private readonly endYm: string;
  private channelNo: string = '';
  private channelName: string = '';

  private readonly SUB_ACCOUNT_API =
    'https://sell.smartstore.naver.com/api/member/auth?_action=inviteAction';
  private readonly SUB_ACCOUNT_PAYLOAD = {
    roleGroupType: 'ACCOUNT',
    members: [
      { name: '', cellPhoneNumber: { countryCode: 'KOR', phoneNo: '' } },
    ],
  };

  constructor(
    userId: string,
    password: string,
    bizNo: string,
    subAccountName: string,
    subAccountPhoneNumber: string,
    includeVat?: boolean,
    startYm?: string,
    endYm?: string,
  ) {
    super(OnlineMall.SmartPlace, userId, password, bizNo, true);
    this.subAccountName = subAccountName;
    this.subAccountPhoneNumber = subAccountPhoneNumber;
    this.includeVat = includeVat || false;
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
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
      const loginSuccess = await this.loginNaver();
      if (!loginSuccess) {
        const buffer = await this.scrapeWright.screenshotFullPage();
        await this.dbLogger.writeLog(Log.FAILED, buffer);
        return false;
      }

      return true;
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

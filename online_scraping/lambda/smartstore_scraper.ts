import { OnlineMall } from './online_mall';
import { AbstractSmartStore } from './abstract_smartstore';
import { Log } from './log';
import { StatusType } from './redis';
import { getEndYearMonth, getStartYearMonth } from './date_util';

export class SmartStoreScraper extends AbstractSmartStore {
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
    onlineMall: OnlineMall,
    userId: string,
    password: string,
    bizNo: string,
    subAccountName: string,
    subAccountPhoneNumber: string,
    includeVat?: boolean,
    startYm?: string,
    endYm?: string,
  ) {
    super(onlineMall, userId, password, bizNo, true);
    this.subAccountName = subAccountName;
    this.subAccountPhoneNumber = subAccountPhoneNumber;
    this.includeVat = includeVat || false;
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
  }

  async checkBizNo(): Promise<boolean> {
    console.log('사업자번호를 체크합니다. 잠시 기다려주세요...');
    await this.scrapeWright.waitForTimeout(5000);

    const headers = {
      'Content-Type': 'application/json',
      Origin: 'https://sell.smartstore.naver.com',
      Referer: 'https://sell.smartstore.naver.com/',
    };

    const channelRes = await this.scrapeWright.get(
      'https://sell.smartstore.naver.com/api/login/channels',
      headers,
    );

    if (!channelRes || !Array.isArray(channelRes) || channelRes.length === 0) {
      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_COMMERCE_FAIL_TO_GET_CHANNELS,
        JSON.stringify(channelRes),
      );
      return false;
    }

    const channelLength = channelRes.length;
    await this.dbLogger.writeLogWithInfo(
      Log.NAVER_COMMERCE_BIZ_NO_COUNT,
      channelLength.toString(),
    );

    let isMatchedBizNo: boolean = false;
    let isRequestedSubAccount: boolean = false;
    const channelNos: any[] = [];
    const vatDataArr: any[] = [];
    for (let i = 0; i < channelLength; i++) {
      const channelNo = channelRes[i].channelNo;
      const channelName = channelRes[i].channelName;
      const roleNo = channelRes[i].roleNo;
      const changeChannelUrl = `https://sell.smartstore.naver.com/api/login/change-channel?channelNo=${channelNo}&roleNo=${roleNo}&url=https:%2F%2Fsell.smartstore.naver.com%2F%23%2Fhome%2Fdashboard`;

      const options = {
        headers: headers,
      };
      const changeChannelRes = await this.scrapeWright.postResponse(
        changeChannelUrl,
        options,
      );

      const responseHeaders = changeChannelRes.headers();
      const ncpLoginInfo = responseHeaders['x-ncp-login-info'];
      const decoded = decodeURIComponent(ncpLoginInfo);
      const jsonData = JSON.parse(decoded);
      let redirectUrl = jsonData.redirectUrl;
      if (!redirectUrl) {
        redirectUrl = 'https://sell.smartstore.naver.com/#/home/dashboard';
      }

      await this.scrapeWright.goto(redirectUrl);
      await this.scrapeWright.waitForTimeout(2000);

      const siteBizNo = await this.getBizNo();

      if (siteBizNo === this.bizNo) {
        isMatchedBizNo = true;
        channelNos.push(channelNo);

        await this.dbLogger.writeLogWithInfo(
          Log.NAVER_COMMERCE_BIZ_NO_MATCHED,
          siteBizNo,
        );

        this.channelNo = channelNo;
        this.channelName = channelName;

        const success = await this.requestSubAccount();
        if (success) {
          isRequestedSubAccount = true;
        }

        if (success && this.includeVat) {
          const vatData = await this.scrapeVat(
            this.startYm,
            this.endYm,
            this.channelNo,
            this.channelName,
          );

          if (vatData) {
            vatDataArr.push(vatData);
          }
        }
      }
    }

    await this.redisClient.set(
      this.redisClient.getCheckBizNoKey(),
      isMatchedBizNo.toString(),
    );

    if (!isMatchedBizNo) {
      await this.redisClient.lpush({
        action: false,
        type: StatusType.MISMATCH_BIZ_NO.toString(),
      });
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_BIZ_NO_NOT_MATCHED);
    } else {
      await this.redisClient.lpush({
        action: false,
        type: StatusType.COMPLETED.toString(),
      });
    }

    if (channelNos.length > 0) {
      await this.redisClient.set(
        this.redisClient.getChannelNoKey(),
        channelNos.join(','),
      );
    }

    if (vatDataArr.length > 0) {
      await this.redisClient.set(
        this.redisClient.getVatDataKey(),
        JSON.stringify(vatDataArr),
      );
    }

    console.log(JSON.stringify(vatDataArr, null, 2));

    return isRequestedSubAccount;
  }

  async requestSubAccount(): Promise<boolean> {
    console.log('---requestSubAccount---');

    const headers = {
      'Content-Type': 'application/json',
      Origin: 'https://sell.smartstore.naver.com',
      Referer: 'https://sell.smartstore.naver.com/',
    };

    this.SUB_ACCOUNT_PAYLOAD.members[0].name = this.subAccountName;
    this.SUB_ACCOUNT_PAYLOAD.members[0].cellPhoneNumber.phoneNo =
      this.subAccountPhoneNumber;

    const options = {
      headers: headers,
      data: this.SUB_ACCOUNT_PAYLOAD,
    };

    const res = await this.scrapeWright.postWithTextRes(
      this.SUB_ACCOUNT_API,
      options,
    );

    // {"code":"BAD_REQUEST","message":"이름 항목에 허용 되지 않는 문자가 있습니다.","timestamp":"2025-06-06T12:28:16.045+0000","needAlert":true}
    // {"code":"BAD_REQUEST","message":"매니저 초대 권한이 없습니다.","timestamp":"2025-06-02T05:22:56.771+0000","needAlert":true}
    // {"code":"INTERNAL_SERVER_ERROR","message":"정상상태인 스토어에 대해서만 초대발송이 가능합니다.","timestamp":"2025-06-02T05:24:29.480+0000","needAlert":true}
    console.log(`Sub account request response: --${res}--`);
    await this.dbLogger.writeLog(Log.NAVER_COMMERCE_REQUEST_SUB_ACCOUNT);

    const success = res === '';
    await this.redisClient.set(
      this.redisClient.getSubAccountKey(),
      success.toString(),
    );

    if (success) {
      await this.dbLogger.writeLog(
        Log.NAVER_COMMERCE_SUCCEED_TO_INVITE_SUB_ACCOUNT,
      );
    } else {
      if (res.includes('매니저 초대 권한이 없습니다')) {
        await this.redisClient.lpush({
          action: false,
          type: StatusType.REQUIRE_MAIN_ACCOUNT.toString(),
        });
      }
      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_COMMERCE_FAIL_TO_INVITE_SUB_ACCOUNT,
        res,
      );
    }

    return success;
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
      const loginSuccess = await this.login();
      if (!loginSuccess) {
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

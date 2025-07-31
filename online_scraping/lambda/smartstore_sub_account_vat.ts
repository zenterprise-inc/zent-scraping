import { OnlineMall } from './online_mall';
import { AbstractSmartStore } from './abstract_smartstore';
import { getEndYearMonth, getStartYearMonth } from './date_util';

export class SmartStoreSubAccountVat extends AbstractSmartStore {
  private readonly channelNos: string[];
  private readonly startYm: string;
  private readonly endYm: string;
  private channelName: string = '';

  constructor(
    userId: string,
    password: string,
    bizNo: string,
    channelNos: string[],
    startYm?: string,
    endYm?: string,
  ) {
    super(OnlineMall.SmartStore, userId, password, bizNo, false);

    this.channelNos = channelNos;
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
  }

  async changeChannel(channelNo: string): Promise<boolean> {
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
      return false;
    }

    const channelLength = channelRes.length;

    if (channelLength == 1) {
      const siteBizNo = await this.getBizNo();

      this.channelName = channelRes[0].channelName;
      return siteBizNo === this.bizNo;
    } else {
      const channel = channelRes.find(
        (channel) => channel.channelNo.toString() === channelNo,
      );

      if (!channel) {
        console.error(`Channel ${channelNo} not found`);
        return false;
      }

      this.channelName = channel.channelName;
      const roleNo = channel.roleNo;

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
      return siteBizNo === this.bizNo;
    }
  }

  async process(): Promise<any> {
    const success = await this.loginCommerce();
    if (!success) {
      console.error('Login failed');
      return false;
    }

    const vatDataArr: any[] = [];
    for (const channelNo of this.channelNos) {
      const channelChanged = await this.changeChannel(channelNo);
      if (!channelChanged) {
        console.error('Channel change failed');
        continue;
      }

      console.log(this.startYm, this.endYm);

      const vatData = await this.scrapeVat(
        this.startYm,
        this.endYm,
        channelNo,
        this.channelName,
      );

      if (vatData) {
        vatDataArr.push(vatData);
      }
    }

    return vatDataArr;
  }
}

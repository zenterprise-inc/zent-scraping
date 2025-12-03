import { OnlineMall } from './online_mall';
import { AbstractSmartStore } from './abstract_smartstore';

export class SmartInsertChannelNo extends AbstractSmartStore {
  constructor(userId: string, password: string) {
    super(OnlineMall.SmartStore, userId, password, '0000000000', '', '', false);
  }

  async exploreChannels(): Promise<boolean> {
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

    for (let i = 0; i < channelLength; i++) {
      const channelNo = channelRes[i].channelNo;
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

      console.log(
        `Checking channel: ${channelNo}, siteBizNo: ${siteBizNo}, name: ${channelRes[i].channelName}`,
      );

      await this.dbLogger.updateSmartStoreChannelNo(siteBizNo, channelNo);
    }

    return true;
  }

  async process(): Promise<any> {
    const success = await this.loginCommerce();
    if (!success) {
      console.error('Login failed');
      return false;
    }

    await this.exploreChannels();
  }
}

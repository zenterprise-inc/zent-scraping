import { AbstractSmartStore } from './abstract_smartstore';
import {
  getEndYearMonth,
  getStartYearMonth,
  getVatHalf,
  getVatYear,
} from './date_util';
import { OnlineMall } from './online_mall';

export class SmartStoreVat extends AbstractSmartStore {
  private readonly startYm: string;
  private readonly endYm: string;

  constructor(
    userId: string,
    password: string,
    startYm?: string,
    endYm?: string,
  ) {
    super(OnlineMall.SmartStore, userId, password, '0000000000', '', '', false);
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
  }

  async scrapeVats(): Promise<any> {
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

    const beforeJuly = new Date(new Date().getFullYear(), 6, 2);

    const onlineMallAccounts =
      await this.dbLogger.getOnlineMallAccountsByMallTypeAndScrapingTime(
        OnlineMall.SmartStore,
        beforeJuly,
        'before',
      );

    for (const onlineMallAccount of onlineMallAccounts) {
      const vatDeclare = await this.dbLogger.getVatDeclare(
        onlineMallAccount.bmanTin,
        getVatYear(),
        getVatHalf(),
      );

      if (!vatDeclare) {
        console.log(
          `No VAT declare found for ${onlineMallAccount.bizNo}, ${onlineMallAccount.mallId}`,
        );
        continue;
      }

      const onlineMallStores =
        await this.dbLogger.getOnlineMallStoresByAccountId(
          onlineMallAccount.id,
        );

      const vatDataArr: any[] = [];
      for (const onlineMallStore of onlineMallStores) {
        const channelNo = onlineMallStore.storeId;

        const channel = channelRes.find(
          (channel) => channel.channelNo.toString() === channelNo,
        );

        if (!channel) {
          console.error(`Channel ${channelNo} not found`);
          continue;
        }

        const channelName = channel.channelName;
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
        if (siteBizNo === onlineMallAccount.bizNo) {
          const vatData = await this.scrapeVat(
            this.startYm,
            this.endYm,
            channelNo,
            channelName,
          );

          if (vatData) {
            vatDataArr.push(vatData);
          }
        }
      }

      if (vatDataArr.length > 0) {
        await this.dbLogger.updateSuccesfulScrapingStatus(
          onlineMallAccount,
          vatDeclare,
          vatDataArr,
          this.startYm,
          this.endYm,
        );
      }
    }
  }

  async process(): Promise<any> {
    const success = await this.loginCommerce();
    if (!success) {
      console.error('Login failed');
      return false;
    }
    const data = await this.scrapeVats();

    return data;
  }
}

import { OnlineMall } from './online_mall';
import { Log } from './log';
import { AbstractGotScraper } from './abstract_got_scraper';
import { CookieJar } from 'tough-cookie';
import { gotScraping } from 'got-scraping';

export abstract class AbstractGotCoupang extends AbstractGotScraper {
  protected readonly userId: string;
  protected readonly password: string;

  protected cookieJar: CookieJar;
  protected globalData: any;

  protected readonly GET_HEADER = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  };

  protected readonly FORM_DATA_POST_HEADER = {
    ...this.GET_HEADER,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  private readonly VAT_API =
    'https://wing.coupang.com/tenants/msf/wing/api/payment-method/list';
  private readonly VAT_PAYLOAD = { from: 202501, to: 202506 };

  constructor(
    onlineMall: OnlineMall,
    userId: string,
    password: string,
    bizNo: string,
  ) {
    super(onlineMall, userId, bizNo);
    this.userId = userId;
    this.password = password;

    this.cookieJar = new CookieJar();
  }

  async scrapeVat(startYm: string, endYm: string): Promise<any> {
    let brokerBody = {};
    try {
      brokerBody = await this.scrapeIntermediaryVat(startYm, endYm);
    } catch (error) {
      await this.dbLogger.writeLog(Log.COUPANG_ERROR_SCRAPE_INTERMEDIARY_VAT);
      console.error('Error scraping broker data:', error);
    }
    let rocketBody = {};
    try {
      rocketBody = await this.scrapeRocketGrowthVat(startYm, endYm);
    } catch (error) {
      await this.dbLogger.writeLog(Log.COUPANG_ERROR_SCRAPE_ROCKET_GROWTH_VAT);
      console.error('Error scraping rocket data:', error);
    }

    const body = {
      storeId: [this.globalData.vendorId || ''],
      storeName: [this.globalData.vendorName || ''],
      intermediary: brokerBody,
      rocketGrowth: rocketBody,
    };

    console.log(JSON.stringify(body, null, 2));
    return body;
  }

  async scrapeIntermediaryVat(startYm: string, endYm: string): Promise<any> {
    const HEADERS = {
      'Content-Type': 'application/json',
      Origin: 'https://wing.coupang.com',
      Referer:
        'https://wing.coupang.com/tenants/msf/wing/view/payment-method-view?commerceType=MARKET&financeUrl=https%3A%2F%2Fwing.coupang.com&version=1&financeTicketUrl=https%3A%2F%2Fexternal-finance-ticket.coupang.com&wing_service_url=https%3A%2F%2Fwing.coupang.com&isProduction=true&isLocal=false&currentPlatform=DESKTOP&currentLocale=ko',
    };

    this.VAT_PAYLOAD.from = parseInt(startYm, 10);
    this.VAT_PAYLOAD.to = parseInt(endYm, 10);

    console.log('VAT_PAYLOAD', JSON.stringify(this.VAT_PAYLOAD));

    const response = await gotScraping(this.VAT_API, {
      cookieJar: this.cookieJar,
      method: 'POST',
      headers: {
        ...HEADERS,
      },
      json: this.VAT_PAYLOAD,
    });

    const body = JSON.parse(response.body);
    const length = body.paymentMethodReports.length;
    for (let i = 0; i < length; i++) {
      const report = body.paymentMethodReports[i];
      report.date = `${report.yearMonth.substring(0, 4)}-${report.yearMonth.substring(4, 6)}`;
    }

    return body;
  }

  async scrapeRocketGrowthVat(startYm: string, endYm: string): Promise<any> {
    const HEADERS = {
      'Content-Type': 'application/json',
      Origin: 'https://wing.coupang.com',
      Referer:
        'https://wing.coupang.com/tenants/rfm/settlements/vat-report?category=GOLDFISH',
    };

    const rocketVatApi = `https://wing.coupang.com/tenants/rfm/api/settlements/vat/search?fromYearMonth=${startYm.substring(0, 4)}-${startYm.substring(4, 6)}&toYearMonth=${endYm.substring(0, 4)}-${endYm.substring(4, 6)}`;

    const response = await gotScraping(rocketVatApi, {
      cookieJar: this.cookieJar,
      method: 'GET',
      headers: {
        ...HEADERS,
      },
    });

    const body = JSON.parse(response.body);
    const length = body.vatResponseAggregatedDtos.length;
    for (let i = 0; i < length; i++) {
      const report = body.vatResponseAggregatedDtos[i];
      report.date = report.yearMonth;
    }

    return body;
  }

  async loginSubAccount(userId: string, password: string): Promise<boolean> {
    // await this.dbLogger.writeLog(Log.COUPANG_START_LOGIN);
    // await this.scrapeWright.goto(
    //   'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth?response_type=code&client_id=wing&redirect_uri=https%3A%2F%2Fwing.coupang.com%2Fsso%2Flogin?returnUrl%3D%252F&state=a055e10a-57ce-4d65-881d-329b081913f7&login=true&ui_locales=ko-KR&scope=openid',
    // );
    // await this.scrapeWright.waitForTimeout(2000);
    // await this.scrapeWright.fill('//input[@id="username"]', userId);
    // await this.scrapeWright.fill('//input[@id="password"]', password);
    // await this.scrapeWright.waitForTimeout(1000);
    // await this.scrapeWright.click('//input[@id="kc-login"]');
    // await this.dbLogger.writeLog(Log.COUPANG_TRY_LOGIN);
    // await this.scrapeWright.waitForTimeout(5000);
    // if (
    //   await this.scrapeWright.exists(
    //     '//span[contains(text(), "비밀번호가 다릅니다")]',
    //   )
    // ) {
    //   await this.dbLogger.writeLog(Log.COUPANG_WRONG_ACCOUNT);
    //   return false;
    // } else if (
    //   await this.scrapeWright.exists(
    //     '//span[contains(text(), "5번 잘못 입력")]',
    //   )
    // ) {
    //   await this.dbLogger.writeLog(Log.COUPANG_SUSPENDED_ACCOUNT);
    //   return false;
    // }
    //
    // if (
    //   this.scrapeWright
    //     .url()
    //     .startsWith(
    //       'https://xauth.coupang.com/auth/realms/seller/login-actions/authenticate',
    //     )
    // ) {
    //   console.log('MFA 인증이 필요합니다. 문자를 입력해주세요.');
    //   await this.scrapeWright.clickFirst('//div[@class="cp-mfa-container"]');
    //
    //   const index = userId.startsWith(SUB_ACCOUNT_CONTACTS[0].idPrefix) ? 0 : 1;
    //   const json = await this.redisClient.brpopInCoupangSMS(index, 60 * 5, 0);
    //   if (json === null) {
    //     return false;
    //   }
    //
    //   const authCode = json.data;
    //   await this.scrapeWright.fill('//input[@id="auth-mfa-code"]', authCode);
    //   await this.scrapeWright.waitForTimeout(2000);
    //
    //   await this.scrapeWright.click('//input[@id="mfa-submit"]');
    //
    //   await this.scrapeWright.waitForTimeout(2000);
    //
    //   if (
    //     await this.scrapeWright.exists(
    //       '//span[contains(text(), "인증번호를 잘못 입력")]',
    //     )
    //   ) {
    //     console.log(
    //       `인증번호를 잘못 입력했습니다. 다시 시도해주세요. ${authCode}`,
    //     );
    //
    //     return false;
    //   }
    // }
    //
    // if (this.scrapeWright.url().startsWith('https://wing.coupang.com')) {
    //   return true;
    // } else {
    //   return false;
    // }

    return false;
  }
}

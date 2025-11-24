import { OnlineMall } from './online_mall';
import { Log } from './log';
import { AbstractSmartStoreLogin } from './abstract_smartstore_login';

const AUTH_TIMEOUT = 60 * 3 - 1;
const MAX_RETRY_AUTH_COUNT = 3;
const MAX_RESEND_AUTH_NUMBER = 3;

export abstract class AbstractSmartStore extends AbstractSmartStoreLogin {
  protected onlineMall: OnlineMall;
  protected userId: string;
  protected password: string;
  protected bizNo: string;

  protected isTerminated = false;

  private readonly GRAPHQL_VAT_API =
    'https://sell.smartstore.naver.com/e/v3/graphql';
  private readonly GRAPHQL_VAT_PAYLOAD = {
    operationName: 'findMonthlyVatDeclarationsUsingGET',
    variables: { endYm: '', includeTotal: true, merchantNo: '', startYm: '' },
    query:
      'query findMonthlyVatDeclarationsUsingGET($endYm: String!, $includeTotal: Boolean, $merchantNo: String!, $startYm: String!) {\n  MonthlyVatDeclaration: findMonthlyVatDeclarationsUsingGET(\n    endYm: $endYm\n    includeTotal: $includeTotal\n    merchantNo: $merchantNo\n    startYm: $startYm\n  ) {\n    ...MonthlyVatDeclarationElementFieldMp\n    __typename\n  }\n}\n\nfragment MonthlyVatDeclarationElementFieldMp on MonthlyVatDeclaration {\n  cashIncomeAdmissionAmount\n  cashOutgoingVouchAdmissionAmount\n  creditCardAdmissionAmount\n  etcAmount\n  publicationYm\n  taxFreeSellingAmount\n  taxationSellingAmount\n  __typename\n}',
  };

  protected constructor(
    onlineMall: OnlineMall,
    userId: string,
    password: string,
    bizNo: string,
    recoverable: boolean = true,
  ) {
    super(onlineMall, userId, password, bizNo, recoverable);
    this.onlineMall = onlineMall;
    this.userId = userId;
    this.password = password;
    this.bizNo = bizNo;
  }

  async init(): Promise<void> {
    await super.init();
  }

  async checkCommerceLogin(): Promise<boolean> {
    if (
      this.scrapeWright
        .url()
        .startsWith('https://accounts.commerce.naver.com/certify')
    ) {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_REDIRECT_TO_CERTIFY);
      return true;
      // await this.authorizeCommerceAccount();
    }

    if (
      this.scrapeWright.url().startsWith('https://sell.smartstore.naver.com')
    ) {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_REDIRECT_TO_SMARTSTORE);
      return true;
    } else {
      const buffer = await this.scrapeWright.screenshotFullPage();

      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_COMMERCE_FAIL_TO_REDIRECT_TO_SMARTSTORE,
        this.scrapeWright.url(),
        buffer,
      );
      return false;
    }
  }

  async getBizNo(): Promise<string> {
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'https://sell.smartstore.naver.com',
      Referer: 'https://sell.smartstore.naver.com/',
    };

    const res = await this.scrapeWright.get(
      'https://sell.smartstore.naver.com/api/sellers/account?maskApplyTypes=MEMBER&maskApplyTypes=SETTLEMENT',
      headers,
    );
    await this.dbLogger.writeLog(Log.NAVER_COMMERCE_REQUEST_SELLER_INFO);

    if (!res || !res.represent || !res.represent.identity) {
      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_COMMERCE_FAIL_TO_GET_SELLER_INFO,
        JSON.stringify(res),
      );
      return '';
    }

    const siteBizNo = res.represent.identity;
    console.log(`사업자번호: --${siteBizNo}--`);

    return siteBizNo;
  }

  async scrapeVat(
    startYm: string,
    endYm: string,
    channelNo: string,
    channelName: string,
  ): Promise<any> {
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'https://sell.smartstore.naver.com',
      Referer:
        'https://sell.smartstore.naver.com/#/naverpay/settlemgt/vatdeclaration',
    };

    this.GRAPHQL_VAT_PAYLOAD.variables.startYm = startYm;
    this.GRAPHQL_VAT_PAYLOAD.variables.endYm = endYm;

    const options = {
      headers: headers,
      data: this.GRAPHQL_VAT_PAYLOAD,
    };

    const vatBody = await this.scrapeWright.post(this.GRAPHQL_VAT_API, options);

    if (vatBody?.data?.MonthlyVatDeclaration) {
      const length = vatBody.data.MonthlyVatDeclaration.length;
      for (let i = 0; i < length; i++) {
        const report = vatBody.data.MonthlyVatDeclaration[i];
        if (report.publicationYm !== '합계') {
          report.date = `${report.publicationYm.substring(0, 4)}-${report.publicationYm.substring(4, 6)}`;
        }
      }

      const body = {
        storeId: [channelNo || ''],
        storeName: [channelName || ''],
        data: vatBody.data,
      };

      return body;
    } else {
      console.log('No Vat Data', JSON.stringify(vatBody, null, 2));
      return '';
    }
  }
}

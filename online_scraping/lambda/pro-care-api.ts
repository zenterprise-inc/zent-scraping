import fetch from 'node-fetch';

interface VatPayload {
  vatDeclareId: number;
  onlineMallScrapingResultId: number | undefined;
  data: {
    bsno: string;
    mallType: string | undefined;
    storeName: string;
    vat: any[];
  };
}

export class ProCareApi {
  private logger: any;

  constructor() {
    this.logger = console;
  }

  private async getToken(): Promise<string> {
    const login: any = await fetch('https://pro.care.bznav.com/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: process.env.PRO_CARE_ID,
        password: process.env.PRO_CARE_PWD,
      }),
    }).then((response) => response.json());

    return login.access_token;
  }

  async sendScrapedVatData(payload: VatPayload): Promise<boolean> {
    try {
      const token = await this.getToken();

      const response = await fetch(
        `https://pro.care.bznav.com/api/books/vats/from-scraped-data`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            vat_declare_id: payload.vatDeclareId,
            online_mall_scraping_result_id: payload.onlineMallScrapingResultId,
            data: {
              bsno: payload.data.bsno,
              mall_type: payload.data.mallType,
              storeName: payload.data.storeName,
              vat: payload.data.vat,
            },
          }),
        },
      );

      if (!response.ok) {
        this.logger.info(
          `http status code: ${response.status}`,
        );
        return false;
      }

      const result = await response.json();
      this.logger.info(`sendScrapedVatData Result: ${JSON.stringify(result)}`);
      return true;
    } catch (e: any) {
      this.logger.error(`sendScrapedVatData Error: ${e.message}`);
      return false;
    }
  }
}

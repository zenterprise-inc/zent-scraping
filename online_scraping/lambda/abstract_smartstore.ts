import { AbstractScraper } from './abstract_scraper';
import { OnlineMall } from './online_mall';
import { OpenAIClient } from './open_ai_client';
import { OperationType, StatusType } from './redis';
import { Log } from './log';

const AUTH_TIMEOUT = 60 * 3 - 1;
const MAX_RETRY_AUTH_COUNT = 3;
const MAX_RESEND_AUTH_NUMBER = 3;

export abstract class AbstractSmartStore extends AbstractScraper {
  protected onlineMall: OnlineMall;
  protected userId: string;
  protected password: string;
  protected bizNo: string;

  private naverLog: Log | null = null;
  protected isTerminated = false;

  private readonly GRAPHQL_VAT_API =
    'https://sell.smartstore.naver.com/e/v3/graphql';
  private readonly GRAPHQL_VAT_PAYLOAD = {
    operationName: 'findMonthlyVatDeclarationsUsingGET',
    variables: { endYm: '', includeTotal: true, merchantNo: '', startYm: '' },
    query:
      'query findMonthlyVatDeclarationsUsingGET($endYm: String!, $includeTotal: Boolean, $merchantNo: String!, $startYm: String!) {\n  MonthlyVatDeclaration: findMonthlyVatDeclarationsUsingGET(\n    endYm: $endYm\n    includeTotal: $includeTotal\n    merchantNo: $merchantNo\n    startYm: $startYm\n  ) {\n    ...MonthlyVatDeclarationElementFieldMp\n    __typename\n  }\n}\n\nfragment MonthlyVatDeclarationElementFieldMp on MonthlyVatDeclaration {\n  cashIncomeAdmissionAmount\n  cashOutgoingVouchAdmissionAmount\n  creditCardAdmissionAmount\n  etcAmount\n  publicationYm\n  taxFreeSellingAmount\n  taxationSellingAmount\n  __typename\n}',
  };

  private readonly GRAPHQL_SNS_LOGIN_API =
    'https://accounts.commerce.naver.com/graphql?query=snsLoginBegin';
  private readonly GRAPHQL_SNS_LOGIN_PAYLOAD = {
    operationName: 'snsLoginBegin',
    variables: {
      mode: 'login',
      snsCd: 'naver',
      svcUrl:
        'https://sell.smartstore.naver.com/#/login-callback?returnUrl=https%3A%2F%2Fsell.smartstore.naver.com%2F%23%2Fnaverpay%2Fsettlemgt%2Fvatdeclaration',
      userInfos: [
        {
          key: 'IS_NOT_REAUTHENTICATE',
          value: 'true',
        },
      ],
    },
    query:
      'mutation snsLoginBegin($mode: String!, $snsCd: String!, $svcUrl: String!, $oneTimeLoginSessionKey: String, $userInfos: [UserInfoEntry!]) {\n  snsBegin(\n    snsLoginBeginRequest: {mode: $mode, snsCd: $snsCd, svcUrl: $svcUrl, oneTimeLoginSessionKey: $oneTimeLoginSessionKey, userInfos: $userInfos}\n  ) {\n    authUrl\n    __typename\n  }\n}\n',
  };

  protected constructor(
    onlineMall: OnlineMall,
    userId: string,
    password: string,
    bizNo: string,
    recoverable: boolean = true,
  ) {
    super(onlineMall, userId, bizNo, recoverable);
    this.onlineMall = onlineMall;
    this.userId = userId;
    this.password = password;
    this.bizNo = bizNo;
  }

  async init(): Promise<void> {
    await super.init();
    // await this.scrapeWright.blockResourceTypes(
    //   ['image'],
    //   [
    //     'https://sell.smartstore.naver.com/images/no-img.jpg',
    //     'https://captcha.nid.naver.com/nhncaptcha',
    //   ],
    // );
  }

  async login(): Promise<boolean> {
    const isNaverLogin = await this.loginNaver();
    await this.redisClient.set(
      this.redisClient.getNaverLoginKey(),
      isNaverLogin.toString(),
    );
    if (isNaverLogin) {
      return isNaverLogin;
    } else {
      if (this.isTerminated) {
        return false;
      }
      const isNaverCommerceLogin = await this.loginCommerce();

      await this.redisClient.set(
        this.redisClient.getNaverCommerceLoginKey(),
        isNaverCommerceLogin.toString(),
      );

      return isNaverCommerceLogin;
    }
  }

  async loginNaver(): Promise<boolean> {
    await this.dbLogger.writeLog(Log.NAVER_START_LOGIN);
    await this.scrapeWright.goto(
      'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fsell.smartstore.naver.com%2F%23%2Fnaverpay%2Fsettlemgt%2Fvatdeclaration',
    );
    await this.scrapeWright.waitForTimeout(2000);

    let captchaSuccess = false;
    const captchaSelector = '//img[@id="captchaimg"]';
    if (await this.scrapeWright.exists(captchaSelector)) {
      await this.dbLogger.writeLog(Log.NAVER_REQUIRE_RECEIPT_TEST);
      const captchaRes = await this.solveNaverCaptcha();
      if (!captchaRes) {
        return false;
      }
      captchaSuccess = true;
    }

    if (!captchaSuccess) {
      await this.scrapeWright.fill('//input[@id="id"]', this.userId);
      await this.scrapeWright.fill('//input[@id="pw"]', this.password);
      await this.scrapeWright.waitForTimeout(1000);
      await this.scrapeWright.click('//button[@id="log.login"]');
      await this.dbLogger.writeLog(Log.NAVER_TRY_LOGIN);
      await this.scrapeWright.waitForTimeout(5000);
      if (await this.scrapeWright.exists('//div[@id="err_common"]')) {
        if (
          (await this.scrapeWright.getAttribute(
            '//div[@id="err_common"]',
            'style',
          )) == null
        ) {
          this.naverLog = Log.NAVER_WRONG_ACCOUNT;
          await this.dbLogger.writeLog(Log.NAVER_WRONG_ACCOUNT);
          return false;
        }
      } else if (await this.scrapeWright.exists(captchaSelector)) {
        await this.dbLogger.writeLog(Log.NAVER_REQUIRE_RECEIPT_TEST);
        const captchaRes = await this.solveNaverCaptcha();
        if (!captchaRes) {
          return false;
        }
      }
    }

    if (await this.scrapeWright.isVisible('//div[@id="push_case"]')) {
      await this.dbLogger.writeLog(Log.NAVER_REQUIRE_2FA_AUTH);

      let resendCount = 0;
      for (let i = 0; i < MAX_RESEND_AUTH_NUMBER + 2; i++) {
        const lpushTs = await this.redisClient.lpush({
          action: true,
          type: OperationType.APP_CONFIRM.toString(),
          data: {
            resendCount: resendCount,
          },
        });
        let urlChanged = false;
        let requireRetry = false;
        for (let j = 0; j < 120; j++) {
          if (
            this.scrapeWright
              .url()
              .startsWith('https://accounts.commerce.naver.com/login')
          ) {
            await this.redisClient.lpush({
              action: false,
              type: StatusType.APP_CONFIRM_SUCCESS.toString(),
            });
            urlChanged = true;
            break;
          }

          const json = await this.redisClient.brpop(1, lpushTs);
          if (
            json != null &&
            json.type === OperationType.APP_CONFIRM.toString()
          ) {
            requireRetry = true;
            resendCount++;
            if (resendCount > MAX_RESEND_AUTH_NUMBER) {
              await this.redisClient.lpush({
                action: false,
                type: StatusType.MAX_RESEND_REACHED.toString(),
              });
            }
            await this.scrapeWright.click('//button[@id="resendBtn"]');
            await this.dbLogger.writeLogWithInfo(
              Log.NAVER_2FA_AUTH_RESEND,
              resendCount.toString(),
            );
            break;
          } else if (
            json != null &&
            json.type === OperationType.TERMINATE.toString()
          ) {
            this.isTerminated = true;
            await this.dbLogger.writeLog(Log.NAVER_TERMINATED);
            return false;
          }
        }

        if (urlChanged) {
          console.log('URL changed to commerce login page');
          break;
        }

        if (!requireRetry) {
          await this.redisClient.lpush({
            action: false,
            type: StatusType.AUTH_TIMEOUT.toString(),
          });
          await this.dbLogger.writeLog(Log.NAVER_2FA_AUTH_TIMEOUT);
          return false;
        }
      }

      await this.scrapeWright.waitForTimeout(3000);
    } else if (await this.scrapeWright.isVisible('//div[@id="direct_case"]')) {
      await this.dbLogger.writeLog(Log.NAVER_REQUIRE_OTP_AUTH);
      return false;
    }

    if (await this.scrapeWright.exists('//a[@id="new.dontsave"]')) {
      await this.scrapeWright.click('//a[@id="new.dontsave"]');
      await this.dbLogger.writeLog(Log.NAVER_DONT_SAVE_LOGIN_DEVICE);
      await this.scrapeWright.waitForTimeout(5000);
    }

    if (
      !this.scrapeWright
        .url()
        .startsWith('https://accounts.commerce.naver.com/login')
    ) {
      await this.scrapeWright.reload();
      await this.scrapeWright.waitForTimeout(3000);
    }

    if (
      this.scrapeWright
        .url()
        .startsWith('https://accounts.commerce.naver.com/login')
    ) {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_REDIRECT_TO_LOGIN);

      const simpleLoginSelector =
        '//button[@type="button" and contains(@class, "Login_btn_login")]';
      let simpleLoginTry = 0;
      while (simpleLoginTry < 5) {
        if (
          !this.scrapeWright
            .url()
            .startsWith('https://accounts.commerce.naver.com/login')
        ) {
          break;
        }

        if (
          (await this.scrapeWright.exists(simpleLoginSelector)) &&
          (await this.scrapeWright.isVisible(simpleLoginSelector))
        ) {
          await this.scrapeWright.click(simpleLoginSelector);

          await this.dbLogger.writeLogWithInfo(
            Log.NAVER_COMMERCE_TRY_NAVER_SIMPLE_LOGIN,
            `${simpleLoginTry}`,
          );
        }

        simpleLoginTry++;
        await this.scrapeWright.waitForTimeout(2000);
      }

      if (
        this.scrapeWright
          .url()
          .startsWith('https://accounts.commerce.naver.com/login')
      ) {
        const headers = {
          'Content-Type': 'application/json',
          Origin: 'https://accounts.commerce.naver.com',
          Referer:
            'https://accounts.commerce.naver.com/login?url=https%3A%2F%2Fsell.smartstore.naver.com%2F%23%2Flogin-callback',
        };

        const options = {
          headers: headers,
          data: this.GRAPHQL_SNS_LOGIN_PAYLOAD,
        };

        const snsLoginJson = await this.scrapeWright.post(
          this.GRAPHQL_SNS_LOGIN_API,
          options,
        );

        const authUrl = snsLoginJson.data?.snsBegin?.authUrl;
        console.log('Auth URL:', authUrl);

        if (authUrl) {
          const popupPage = await this.scrapeWright.openPopup(authUrl);

          await popupPage.waitForLoadState('networkidle');

          const popupHtml = await popupPage.content();
          console.log('Popup HTML Source:', popupHtml);

          const popupUrl = popupPage.url();
          console.log('Popup URL:', popupUrl);

          const popupTitle = await popupPage.title();
          console.log('Popup Title:', popupTitle);

          const buffer = await popupPage.screenshot({});
          await this.dbLogger.writeLogWithInfo(
            Log.NAVER_COMMERCE_SNS_LOGIN_POPOUP,
            this.scrapeWright.url(),
            buffer,
          );

          await popupPage.waitForEvent('close', { timeout: 60000 });
        }

        await this.scrapeWright.waitForTimeout(4000);
      }

      return await this.checkCommerceLogin();
    } else {
      const buffer = await this.scrapeWright.screenshotFullPage();
      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_COMMERCE_FAIL_TO_REDIRECT_TO_LOGIN,
        this.scrapeWright.url(),
        buffer,
      );
      return false;
    }
  }

  async solveNaverCaptcha(): Promise<boolean> {
    await this.dbLogger.writeLog(Log.NAVER_START_RECEIPT_TEST);
    let isLoginSuccess = false;
    for (let i = 0; i < 10; i++) {
      await this.scrapeWright.fill('//input[@id="pw"]', this.password);
      const captchaSelector = '//img[@id="captchaimg"]';
      const captchaImage = await this.scrapeWright.screenshot(captchaSelector);
      const captchaInfo = await this.scrapeWright.innerText(
        '//p[@id="captcha_info"]',
      );
      const question =
        '이미지에 관한 맨 아래 문장에 적합한 답변을 알려줘.\n문장을 반복할 필요는 없고 답변만 말해\n[?]가 문장에 있으면 ?에 해당하는 단어만 말해줘\n' +
        captchaInfo;

      console.log(question);
      const openAIClient = new OpenAIClient();

      const answer = await openAIClient.ask(
        captchaImage,
        question,
        'image/png',
      );

      if (answer !== null) {
        await this.scrapeWright.fill('//input[@id="captcha"]', answer);
      }

      await this.scrapeWright.click('//button[@id="log.login"]');
      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_START_RECEIPT_TEST,
        `${i}: ${answer}`,
      );
      await this.scrapeWright.waitForTimeout(6000);

      if (!(await this.scrapeWright.exists(captchaSelector))) {
        await this.dbLogger.writeLog(Log.NAVER_SUCCEED_RECEIPT_TEST);
        isLoginSuccess = true;
        return true;
      } else {
        await this.dbLogger.writeLogWithInfo(
          Log.NAVER_RECEIPT_TEST_RESULT_URL,
          this.scrapeWright.url(),
        );
      }
    }

    await this.dbLogger.writeLog(Log.NAVER_FAIL_RECEIPT_TEST);
    return false;
  }

  async loginCommerce(): Promise<boolean> {
    await this.dbLogger.writeLog(Log.NAVER_COMMERCE_START_LOGIN);
    await this.redisClient.lpush({
      action: false,
      type: StatusType.START_COMMERCE_LOGIN.toString(),
    });
    await this.scrapeWright.goto(
      'https://accounts.commerce.naver.com/login?url=https%3A%2F%2Fsell.smartstore.naver.com%2F%23%2Flogin-callback',
    );

    await this.scrapeWright.waitForTimeout(2000);
    await this.scrapeWright.fill(
      '//input[@placeholder="아이디 또는 이메일 주소"]',
      this.userId,
    );
    await this.scrapeWright.fill('//input[@type="password"]', this.password);
    await this.scrapeWright.waitForTimeout(2000);

    const captchaSelector = '//img[@alt="캡챠 이미지"]';
    if (await this.scrapeWright.exists(captchaSelector)) {
      return await this.solveCommerceCaptcha();
    } else {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_TRY_LOGIN);
      await Promise.race([
        Promise.all([
          this.scrapeWright.waitForNavigation(),
          this.scrapeWright.clickLast(
            '//button[@type="button"]/span[text()="로그인"]',
          ),
        ]),
        this.scrapeWright.waitForTimeout(20000),
      ]);

      if (await this.scrapeWright.exists(captchaSelector)) {
        return await this.solveCommerceCaptcha();
      }

      if (
        await this.scrapeWright.exists(
          '//div[contains(text(), "비밀번호가 잘못 입력되었습니다")]',
        )
      ) {
        if (this.naverLog === Log.NAVER_WRONG_ACCOUNT) {
          await this.redisClient.lpush({
            action: false,
            type: StatusType.WRONG_ACCOUNT.toString(),
          });
        } else {
          await this.redisClient.lpush({
            action: false,
            type: StatusType.LINK_FAILURE.toString(),
          });
        }
        await this.dbLogger.writeLog(Log.NAVER_COMMERCE_WRONG_ACCOUNT);
        return false;
      }

      return await this.checkCommerceLogin();
    }
  }

  async solveCommerceCaptcha(): Promise<boolean> {
    await this.dbLogger.writeLog(Log.NAVER_COMMERCE_REQUIRE_CAPTCHA_TEST);
    const captchaSelector = '//img[@alt="캡챠 이미지"]';

    let isLoginSuccess = false;
    for (let i = 0; i < 10; i++) {
      await this.scrapeWright.fill('//input[@type="password"]', this.password);
      const captchaImage = await this.scrapeWright.screenshot(captchaSelector);
      const question =
        '이미지는 6자의 알파벳 대문자로 이루어져 있어. 이미지의 알파벳은 왜곡된 형태인 점을 고려해서 6자의 알파벳 대문자를 말해줘. 답변은 간단하게 6자리 알파벳 대문자만 말해줘';

      console.log(question);
      const openAIClient = new OpenAIClient();
      const answer = await openAIClient.ask(
        captchaImage,
        question,
        'image/png',
      );
      console.log(answer);

      if (answer !== null) {
        await this.scrapeWright.fill('//input[@id="captcha"]', answer);
      }

      await this.scrapeWright.clickLast(
        '//button[@type="button"]/span[text()="로그인"]',
      );
      await this.dbLogger.writeLogWithInfo(
        Log.NAVER_COMMERCE_TRY_CAPTCHA,
        `${i}: ${answer}`,
      );
      await this.scrapeWright.waitForTimeout(5000);

      if (
        this.scrapeWright.url().includes('https://sell.smartstore.naver.com') ||
        this.scrapeWright
          .url()
          .includes('https://accounts.commerce.naver.com/certify')
      ) {
        await this.dbLogger.writeLog(Log.NAVER_COMMERCE_CAPTCHA_SUCCESS);
        isLoginSuccess = true;
        break;
      }
    }

    if (isLoginSuccess) {
      return await this.checkCommerceLogin();
    } else {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_CAPTCHA_FAILURE);
      return false;
    }
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

  async authorizeCommerceAccount(): Promise<void> {
    let smsSelected = false;
    if (
      !(await this.scrapeWright.existAttribute(
        '//input[@id="phone" and @type="radio"]',
        'disabled',
      )) &&
      !(await this.scrapeWright.existAttribute(
        '//input[@id="phone" and @type="radio"]',
        'checked',
      ))
    ) {
      await this.scrapeWright.click(
        '//input[@id="phone" and @type="radio"]/following-sibling::label[@for="phone"]',
      );
      smsSelected = true;
    }

    if (
      smsSelected ||
      (await this.scrapeWright.existAttribute(
        '//input[@id="phone" and @type="radio"]',
        'checked',
      ))
    ) {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_START_SMS_AUTH);

      const waitForBody = this.scrapeWright.waitForRequestBody(
        '/graphql?query=requestTwoFactorRegister',
      );

      let authTimestamp = Date.now();
      await Promise.all([
        waitForBody,
        this.scrapeWright.click(
          '//input[@id="phone" and @type="radio"]/following-sibling::div//button[@type="button"]/span[text()="인증"]',
        ),
      ]);
      const requestBody = await waitForBody;
      console.log('Request body:', requestBody);

      let phone = '';
      if (requestBody !== undefined) {
        try {
          const jsonBody = JSON.parse(requestBody);
          phone = jsonBody.variables.to;
        } catch (e) {
          console.log('error:', e);
        }
      }

      console.log('phone:', phone);
      await this.scrapeWright.waitForTimeout(1000);

      let resendCount = 0;
      let tryCount = 0;
      for (let i = 0; i < MAX_RESEND_AUTH_NUMBER; i++) {
        await this.scrapeWright.clickLast(
          '//button[@type="button" and text()="확인"]',
        );

        let lpushTs = await this.redisClient.lpush({
          type: OperationType.SMS.toString(),
          data: {
            tryCount: tryCount,
          },
          authTimestamp: authTimestamp,
        });

        let success = false;
        for (let j = 0; j < MAX_RETRY_AUTH_COUNT; j++) {
          const json = await this.redisClient.brpop(AUTH_TIMEOUT, lpushTs);
          console.log(
            `sms confirmation code received: ${JSON.stringify(json)}`,
          );
          if (json === null) {
            await this.dbLogger.writeLog(Log.NAVER_COMMERCE_SMS_AUTH_TIMEOUT);
            return;
          } else {
            await this.dbLogger.writeLog(Log.NAVER_COMMERCE_SMS_AUTH_NOTIFIED);
          }

          if (json.type == OperationType.SMS.toString()) {
            await this.scrapeWright.fill(
              '//input[@id="phone" and @type="radio"]/following-sibling::div//input[@placeholder="인증번호 숫자 6자리"]',
              json.data,
            );
            await this.scrapeWright.waitForTimeout(2000);
            if (
              await this.scrapeWright.exists(
                '//input[@id="phone" and @type="radio"]/following-sibling::div//div[contains(text(), "다시 확인해")]',
              )
            ) {
              tryCount++;
              lpushTs = await this.redisClient.lpush({
                type: OperationType.INVALID_SMS.toString(),
                data: {
                  tryCount: tryCount,
                },
                authTimestamp: authTimestamp,
              });
              await this.dbLogger.writeLogWithInfo(
                Log.NAVER_COMMERCE_SMS_AUTH_INVALID,
                tryCount.toString(),
              );
            } else {
              await this.dbLogger.writeLog(
                Log.NAVER_COMMERCE_SMS_AUTH_APPROVED,
              );
              success = true;
              break;
            }
          } else if (json.type == OperationType.RESEND_SMS.toString()) {
            resendCount++;
            await this.scrapeWright.click(
              '//input[@id="phone" and @type="radio"]/following-sibling::div//button[@type="button"]/span[text()="취소"]',
            );
            authTimestamp = Date.now();
            await this.scrapeWright.click(
              '//input[@id="phone" and @type="radio"]/following-sibling::div//button[@type="button"]/span[text()="인증"]',
            );
            await this.dbLogger.writeLogWithInfo(
              Log.NAVER_COMMERCE_SMS_AUTH_RESEND,
              resendCount.toString(),
            );
            break;
          }
        }

        if (success) {
          break;
        }
      }

      await Promise.all([
        this.scrapeWright.waitForNavigation(),
        this.scrapeWright.click('//button[@type="button"]/span[text()="확인"]'),
      ]);
    } else if (
      await this.scrapeWright.existAttribute(
        '//input[@id="email" and @type="radio"]',
        'checked',
      )
    ) {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_START_EMAIL_AUTH);

      const waitForBody = this.scrapeWright.waitForRequestBody(
        '/graphql?query=requestTwoFactorRegister',
      );
      let authTimestamp = Date.now();
      await Promise.all([
        waitForBody,
        this.scrapeWright.click(
          '//input[@id="email" and @type="radio"]/following-sibling::div//button[@type="button"]/span[text()="인증"]',
        ),
      ]);
      const requestBody = await waitForBody;
      console.log('Request body:', requestBody);

      let email = '';
      if (requestBody !== undefined) {
        try {
          const jsonBody = JSON.parse(requestBody);
          email = jsonBody.variables.to;
        } catch (e) {
          console.log('error:', e);
        }
      }

      console.log('email:', email);
      await this.scrapeWright.waitForTimeout(1000);

      let resendCount = 0;
      let tryCount = 0;
      for (let i = 0; i < MAX_RESEND_AUTH_NUMBER; i++) {
        await this.scrapeWright.clickLast(
          '//button[@type="button" and text()="확인"]',
        );

        let lpushTs = await this.redisClient.lpush({
          type: OperationType.EMAIL.toString(),
          data: {
            tryCount: tryCount,
          },
          authTimestamp: authTimestamp,
        });

        let success = false;
        for (let j = 0; j < MAX_RETRY_AUTH_COUNT; j++) {
          const json = await this.redisClient.brpop(AUTH_TIMEOUT, lpushTs);
          console.log(
            `email confirmation code received: ${JSON.stringify(json)}`,
          );
          if (json === null) {
            await this.dbLogger.writeLog(Log.NAVER_COMMERCE_EMAIL_AUTH_TIMEOUT);
            return;
          } else {
            await this.dbLogger.writeLog(
              Log.NAVER_COMMERCE_EMAIL_AUTH_NOTIFIED,
            );
          }

          if (json.type == OperationType.EMAIL.toString()) {
            await this.scrapeWright.fill(
              '//input[@id="email" and @type="radio"]/following-sibling::div//input[@placeholder="인증번호 숫자 6자리"]',
              json.data,
            );
            await this.scrapeWright.waitForTimeout(2000);
            if (
              await this.scrapeWright.exists(
                '//input[@id="email" and @type="radio"]/following-sibling::div//div[contains(text(), "다시 확인해")]',
              )
            ) {
              tryCount++;
              lpushTs = await this.redisClient.lpush({
                type: OperationType.INVALID_EMAIL.toString(),
                data: {
                  tryCount: tryCount,
                },
                authTimestamp: authTimestamp,
              });

              await this.dbLogger.writeLogWithInfo(
                Log.NAVER_COMMERCE_EMAIL_AUTH_INVALID,
                tryCount.toString(),
              );
            } else {
              await this.dbLogger.writeLog(
                Log.NAVER_COMMERCE_EMAIL_AUTH_APPROVED,
              );
              success = true;
              break;
            }
          } else if (json.type == OperationType.RESEND_EMAIL.toString()) {
            resendCount++;
            await this.scrapeWright.click(
              '//input[@id="email" and @type="radio"]/following-sibling::div//button[@type="button"]/span[text()="취소"]',
            );
            authTimestamp = Date.now();
            await this.scrapeWright.click(
              '//input[@id="email" and @type="radio"]/following-sibling::div//button[@type="button"]/span[text()="인증"]',
            );
            await this.dbLogger.writeLogWithInfo(
              Log.NAVER_COMMERCE_EMAIL_AUTH_RESEND,
              resendCount.toString(),
            );
            break;
          }
        }
        if (success) {
          break;
        }
      }
      await Promise.all([
        this.scrapeWright.waitForNavigation(),
        this.scrapeWright.click('//button[@type="button"]/span[text()="확인"]'),
      ]);
    }

    await this.scrapeWright.waitForTimeout(2000);
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

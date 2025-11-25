import { AbstractScraper } from './abstract_scraper';
import { OnlineMall } from './online_mall';
import { OpenAIClient } from './open_ai_client';
import { OperationType, StatusType } from './redis';
import { Log } from './log';

const MAX_RESEND_AUTH_NUMBER = 3;

export abstract class AbstractSmartStoreLogin extends AbstractScraper {
  protected onlineMall: OnlineMall;
  protected userId: string;
  protected password: string;
  protected bizNo: string;

  private naverLog: Log | null = null;
  protected isTerminated = false;

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

      return true;
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

  private async solveNaverCaptcha(): Promise<boolean> {
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

      return true;
    }
  }

  private async solveCommerceCaptcha(): Promise<boolean> {
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
      return true;
    } else {
      await this.dbLogger.writeLog(Log.NAVER_COMMERCE_CAPTCHA_FAILURE);
      return false;
    }
  }
}

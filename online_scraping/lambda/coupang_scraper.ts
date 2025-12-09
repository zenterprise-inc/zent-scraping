import { OnlineMall } from './online_mall';
import { OperationType, StatusType } from './redis';
import { Log } from './log';
import { GmailClient } from './gmail/gmail_client';
import { parseJsonOrEmpty } from './json_util';
import { SUB_ACCOUNT_CONTACTS } from './contacts';
import { AbstractCoupang } from './abstract_coupang';
import { getEndYearMonth, getStartYearMonth } from './date_util';

const AUTH_TIMEOUT = 60 * 5 - 1;
const MAX_RETRY_AUTH_COUNT = 3;
const MAX_RESEND_AUTH_NUMBER = 3;
const SUB_USER_NAME = '비즈넵케어';

export class CoupangScraper extends AbstractCoupang {
  private readonly bizNo: string;
  private readonly includeVat: boolean;
  private readonly startYm: string;
  private readonly endYm: string;

  private readonly PHONE_SEND_API =
    'https://wing.coupang.com/tenants/wing-account/vendor-auth/phone';
  private readonly PHONE_SEND_PAYLOAD = {
    contact: '',
    authPurpose: 'CHANGE_USER_INFO',
  };
  private readonly PHONE_SEND_VERIFY_API =
    'https://wing.coupang.com/tenants/wing-account/vendor-auth/phone/verify';
  private readonly PHONE_SEND_VERIFY_PAYLOAD = {
    vendorId: 'null',
    userId: 'null',
    locale: 'ko',
    authNumber: '',
    authPurpose: 'CHANGE_USER_INFO',
    contact: '',
  };
  private readonly EMAIL_SEND_API =
    'https://wing.coupang.com/tenants/wing-account/vendor-auth/email';
  private readonly EMAIL_SEND_PAYLOAD = {
    contact: '',
    authPurpose: 'CHANGE_USER_INFO',
  };
  private readonly EMAIL_VERIFY_API =
    'https://wing.coupang.com/tenants/wing-account/vendor-auth/email/verify';
  private readonly EMAIL_VERIFY_PAYLOAD = {
    vendorId: 'null',
    userId: 'null',
    locale: 'ko',
    authNumber: '',
    authPurpose: 'CHANGE_USER_INFO',
    contact: '',
  };
  private readonly PHONE_CONFIRM_API =
    'https://wing.coupang.com/tenants/wing-account/vendor-auth/phone';
  private readonly PHONE_CONFIRM_PAYLOAD = {
    vendorId: 'null',
    userId: 'null',
    locale: 'ko',
    authPurpose: 'UPDATE_USER_INFO',
  };
  private readonly PHONE_CONFIRM_VERIFY_API =
    'https://wing.coupang.com/tenants/wing-account/vendor-auth/phone/verify';
  private readonly PHONE_CONFIRM_VERIFY_PAYLOAD = {
    vendorId: 'null',
    userId: 'null',
    locale: 'ko',
    authNumber: '',
    authPurpose: 'UPDATE_USER_INFO',
  };
  private readonly CREATE_API =
    'https://wing.coupang.com/tenants/wing-account/vendor/account/create';

  private HEADERS = {
    Origin: 'https://wing.coupang.com',
    Referer:
      'https://wing.coupang.com/tenants/wing-account/vendor/account/create',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  };

  constructor(
    onlineMall: OnlineMall,
    userId: string,
    password: string,
    bizNo: string,
    includeVat?: boolean,
    startYm?: string,
    endYm?: string,
  ) {
    super(onlineMall, userId, password, bizNo);
    this.bizNo = bizNo;
    this.includeVat = includeVat || false;
    this.startYm = startYm || getStartYearMonth();
    this.endYm = endYm || getEndYearMonth();
  }

  async login(): Promise<boolean> {
    await this.dbLogger.writeLog(Log.COUPANG_START_LOGIN);
    await this.scrapeWright.goto(
      'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth?response_type=code&client_id=wing&redirect_uri=https%3A%2F%2Fwing.coupang.com%2Fsso%2Flogin?returnUrl%3D%252F&state=a055e10a-57ce-4d65-881d-329b081913f7&login=true&ui_locales=ko-KR&scope=openid',
    );
    await this.scrapeWright.waitForTimeout(2000);
    await this.scrapeWright.fill('//input[@id="username"]', this.userId);
    await this.scrapeWright.fill('//input[@id="password"]', this.password);
    await this.scrapeWright.waitForTimeout(1000);
    await this.scrapeWright.click('//input[@id="kc-login"]');
    await this.dbLogger.writeLog(Log.COUPANG_TRY_LOGIN);
    await this.scrapeWright.waitForTimeout(5000);
    if (
      await this.scrapeWright.exists(
        '//span[contains(text(), "비밀번호가 다릅니다")]',
      )
    ) {
      await this.sendMessage({
        action: false,
        type: StatusType.WRONG_ACCOUNT,
      });
      await this.dbLogger.writeLog(Log.COUPANG_WRONG_ACCOUNT);
      return false;
    } else if (
      await this.scrapeWright.exists(
        '//span[contains(text(), "5번 잘못 입력")]',
      )
    ) {
      await this.sendMessage({
        action: false,
        type: StatusType.SUSPENDED_ACCOUNT,
      });
      await this.dbLogger.writeLog(Log.COUPANG_SUSPENDED_ACCOUNT);
      return false;
    }

    if (
      this.scrapeWright
        .url()
        .startsWith(
          'https://xauth.coupang.com/auth/realms/seller/login-actions/authenticate',
        )
    ) {
      console.log('MFA 인증이 필요합니다. 문자를 입력해주세요.');

      await this.dbLogger.writeLog(Log.COUPANG_START_MFA_AUTH);

      let authTimestamp = Date.now();
      await this.scrapeWright.clickFirst('//div[@class="cp-mfa-container"]');
      await this.dbLogger.writeLog(Log.COUPANG_TRY_MFA_AUTH);

      let resendCount = 0;
      let tryCount = 0;
      for (let i = 0; i < MAX_RESEND_AUTH_NUMBER + 2; i++) {
        await this.sendMessage({
          action: true,
          type: OperationType.SMS,
          data: {
            tryCount: tryCount,
            resendCount: resendCount,
          },
          authTimestamp: authTimestamp,
        });

        let success = false;
        for (let j = 0; j < MAX_RETRY_AUTH_COUNT; j++) {
          const json = await this.waitMessage(AUTH_TIMEOUT);

          console.log(`mfa json: ${JSON.stringify(json)}`);
          if (json === null) {
            await this.sendMessage({
              action: false,
              type: StatusType.AUTH_TIMEOUT,
            });
            await this.dbLogger.writeLog(Log.COUPANG_MFA_AUTH_TIMEOUT);
            return false;
          } else {
            await this.dbLogger.writeLog(Log.COUPANG_MFA_AUTH_NOTIFIED);
          }

          if (json.type == OperationType.SMS) {
            await this.scrapeWright.fill(
              '//input[@id="auth-mfa-code"]',
              json.data,
            );
            await this.scrapeWright.waitForTimeout(2000);

            await this.scrapeWright.click('//input[@id="mfa-submit"]');

            await this.scrapeWright.waitForTimeout(2000);

            // 인증번호 5번 잘못 입력하셨습니다. 고객센터로 문의주세요
            if (
              await this.scrapeWright.exists(
                '//span[contains(text(), "인증번호를 잘못 입력")]',
              )
            ) {
              tryCount++;
              if (tryCount >= 5) {
                await this.dbLogger.writeLog(
                  Log.COUPANG_MFA_AUTH_REACH_MAX_TRY_CNT,
                );
                return false;
              }
              await this.sendMessage({
                action: true,
                type: OperationType.INVALID_SMS,
                data: {
                  tryCount: tryCount,
                  resendCount: resendCount,
                },
                authTimestamp: authTimestamp,
              });
              await this.dbLogger.writeLogWithInfo(
                Log.COUPANG_MFA_AUTH_INVALID,
                tryCount.toString(),
              );
            } else {
              await this.sendMessage({
                action: false,
                type: StatusType.SMS_SUCCESS,
              });
              await this.dbLogger.writeLog(Log.COUPANG_MFA_AUTH_APPROVED);
              success = true;
              break;
            }
          } else if (json.type == OperationType.RESEND_SMS.toString()) {
            resendCount++;
            if (resendCount > MAX_RESEND_AUTH_NUMBER) {
              await this.sendMessage({
                action: false,
                type: StatusType.MAX_RESEND_REACHED,
              });
              await this.dbLogger.writeLogWithInfo(
                Log.COUPANG_MFA_AUTH_REACH_MAX_RESEND_CNT,
                resendCount.toString(),
              );
              return false;
            }
            authTimestamp = Date.now();
            await this.scrapeWright.click('//input[@id="resend"]');
            await this.dbLogger.writeLogWithInfo(
              Log.COUPANG_MFA_AUTH_RESNED,
              resendCount.toString(),
            );
            break;
          } else if (json.type == OperationType.TERMINATE.toString()) {
            await this.dbLogger.writeLog(Log.COUPANG_TERMINATED);
            return false;
          }
        }

        if (success) {
          break;
        }
      }
    }

    if (
      this.scrapeWright
        .url()
        .startsWith(
          'https://wing.coupang.com/configuration/account/change-password',
        )
    ) {
      console.log('비밀번호 변경이 필요합니다.');
      await this.sendMessage({
        action: false,
        type: StatusType.REQUIRE_PASSWORD_CHANGE,
      });
      await this.dbLogger.writeLog(Log.COUPANG_REQUIRE_PASSWORD_CHANGE);
      return false;
    }

    if (this.scrapeWright.url().startsWith('https://wing.coupang.com')) {
      await this.dbLogger.writeLog(Log.COUPANG_REDIRECT_TO_WING);
      await this.redisClient.set(this.redisClient.getLoginKey(), 'true');
      return true;
    } else {
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_FAIL_TO_REDIRECT_TO_WING,
        this.scrapeWright.url(),
      );
      await this.redisClient.set(this.redisClient.getLoginKey(), 'false');
      return false;
    }
  }

  async checkBizNo(): Promise<boolean> {
    console.log('사업자번호를 체크합니다. 잠시 기다려주세요...');

    await this.dbLogger.writeLog(Log.COUPANG_GO_TO_SELLER_INFO_PAGE);
    await this.scrapeWright.goto(
      'https://wing.coupang.com/tenants/wing-account/vendor/basicinfo?isTARegion=false&currentPlatform=DESKTOP&currentLocale=ko',
    );
    await this.scrapeWright.waitForTimeout(2000);
    await this.scrapeWright.fill('//input[@id="password"]', this.password);
    await this.scrapeWright.waitForTimeout(2000);
    await this.scrapeWright.click('//button[@id="confirm-btn"]');
    await this.dbLogger.writeLog(Log.COUPANG_TRY_TO_ACCESS_TO_SELLER_INFO_PAGE);
    await this.scrapeWright.waitForTimeout(2000);

    if (
      await this.scrapeWright.exists(
        '//h3[contains(text(), "요청하신 페이지를 찾을 수")]',
      )
    ) {
      await this.dbLogger.writeLog(Log.COUPANG_FAIL_TO_GO_TO_SELLER_INFO_PAGE);
      await this.sendMessage({
        action: false,
        type: StatusType.MISMATCH_BIZ_NO,
      });
      await this.redisClient.set(this.redisClient.getCheckBizNoKey(), 'false');
      return false;
    }

    const siteBizNo = (
      await this.scrapeWright.innerText(
        '//dt[text()="사업자번호"]/following-sibling::dd/strong',
      )
    ).replace(/-/g, '');

    await this.redisClient.set(
      this.redisClient.getCheckBizNoKey(),
      (siteBizNo === this.bizNo).toString(),
    );

    if (siteBizNo === this.bizNo) {
      await this.dbLogger.writeLog(Log.COUPANG_BIZ_NO_MATCHED);
      return true;
    } else {
      await this.sendMessage({
        action: false,
        type: StatusType.MISMATCH_BIZ_NO,
      });
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_BIZ_NO_NOT_MATCHED,
        siteBizNo,
      );

      return false;
    }
  }

  async createSubAccount(): Promise<boolean> {
    console.log('서브 계정을 생성합니다. 잠시 기다려주세요...');
    await this.dbLogger.writeLog(Log.COUPANG_START_SUB_ACCOUNT);

    const nextId = await this.redisClient.getNextId();
    const index = nextId % SUB_ACCOUNT_CONTACTS.length;

    const LOCK_KEY = `lock:coupang:subAccount${index}`;
    let count = 0;
    const MAX_ATTEMPTS = 10;
    while (count < MAX_ATTEMPTS) {
      const isLocked = await this.redisClient.setNx(LOCK_KEY, '1', 1000);

      if (isLocked == 'OK') {
        await this.dbLogger.writeLogWithInfo(
          Log.COUPANG_SUCCEED_TO_GET_LOCK,
          index.toString(),
        );
        console.log('Lock acquired for creating sub account.');
        break;
      }
      await this.scrapeWright.waitForTimeout(1000);
      count++;
    }
    if (count == MAX_ATTEMPTS) {
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_FAIL_TO_GET_LOCK,
        index.toString(),
      );
      console.error(
        'Failed to acquire lock for creating sub account after 10 attempts.',
      );
      return false;
    }

    const LAST_AVAILABLE_TIME = `lastAvailableTime:coupang:subAccount${index}`;
    const PROCESSING_TIME = 30 * 1000;
    let waitTimeInMs = 0;
    try {
      const timestamp = Date.now();
      const value = await this.redisClient.get(LAST_AVAILABLE_TIME);
      const availableTimestamp = parseInt(value || '0');
      let updatedAvailableTimestamp =
        timestamp >= availableTimestamp
          ? timestamp + PROCESSING_TIME
          : availableTimestamp + PROCESSING_TIME;
      const updatedAvailableTimestampStr = updatedAvailableTimestamp.toString();
      await this.redisClient.set(
        LAST_AVAILABLE_TIME,
        updatedAvailableTimestampStr,
      );
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_SET_LAST_AVAILABLE_TIME,
        updatedAvailableTimestampStr,
      );

      waitTimeInMs =
        timestamp >= availableTimestamp ? 0 : availableTimestamp - timestamp;
    } finally {
      await this.redisClient.del(LOCK_KEY);
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_RELEASE_LOCK,
        index.toString(),
      );
    }

    if (waitTimeInMs > 0) {
      await this.dbLogger.writeLog(
        Log.COUPANG_START_TO_WAIT_UNTIL_AVAILABLE_TIME,
      );
      await this.scrapeWright.waitForTimeout(waitTimeInMs);
      await this.dbLogger.writeLog(
        Log.COUPANG_END_TO_WAIT_UNTIL_AVAILABLE_TIME,
      );
    }

    await this.dbLogger.writeLog(Log.COUPANG_GO_TO_VENDOR_ACCOUNT_PAGE);
    await this.scrapeWright.goto(
      'https://wing.coupang.com/tenants/wing-account/vendor/manager/create',
    );
    await this.scrapeWright.waitForTimeout(2000);
    await this.scrapeWright.fill('//input[@id="password"]', this.password);
    await this.scrapeWright.waitForTimeout(2000);
    await this.scrapeWright.click('//button[@id="confirm-btn"]');
    await this.dbLogger.writeLog(
      Log.COUPANG_TRY_TO_ACCESS_TO_VENDOR_ACCOUNT_PAGE,
    );
    await this.scrapeWright.waitForTimeout(2000);

    const _ctk = await this.scrapeWright.inputValue('//input[@name="_ctk"]');
    if (_ctk === '') {
      await this.dbLogger.writeLog(Log.COUPANG_FAIL_TO_GET_CTK);
      return false;
    } else {
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_SUCCEED_TO_GET_CTK,
        _ctk,
      );
    }
    console.log(`_ctk: ${_ctk}`);

    return false;

    let tokenForMobile = '';
    for (let i = 0; i < MAX_RETRY_AUTH_COUNT; i++) {
      const curTimestamp = await this.sendAuthNumberToPhone(index);
      const res = await this.verifyPhoneAuthNumber(index, curTimestamp);
      console.log(`verifyPhoneAuthNumber: ${JSON.stringify(res)}`);

      if (res.data.reasonCode === 'SUCCESS') {
        tokenForMobile = res.data.token;
        await this.dbLogger.writeLog(Log.COUPANG_PHONE_AUTH_NUMBER_APPROVED);
        break;
      } else if (res.data.reasonCode === 'INVALID_AUTH_NUMBER') {
        await this.dbLogger.writeLog(Log.COUPANG_PHONE_AUTH_NUMBER_INVALID);
      } else {
        await this.dbLogger.writeLogWithInfo(
          Log.COUPANG_PHONE_AUTH_NUMBER_UNKNOWN_ERROR,
          JSON.stringify(res),
        );
      }
    }

    if (tokenForMobile === '') {
      await this.dbLogger.writeLog(Log.COUPANG_FAIL_TO_GET_TOKEN_FOR_MOBILE);
      return false;
    }

    let tokenForEmail = '';
    for (let i = 0; i < MAX_RETRY_AUTH_COUNT; i++) {
      const curTimestampInSec = await this.sendAuthNumberToEmail(index);
      const res = await this.verifyEmailAuthNumber(index, curTimestampInSec);
      console.log(`verifyEmailAuthNumber: ${JSON.stringify(res)}`);

      if (res.data.reasonCode === 'SUCCESS') {
        tokenForEmail = res.data.token;
        await this.dbLogger.writeLog(Log.COUPANG_EMAIL_AUTH_NUMBER_APPROVED);
        break;
      } else if (res.data.reasonCode === 'INVALID_AUTH_NUMBER') {
        await this.dbLogger.writeLog(Log.COUPANG_EMAIL_AUTH_NUMBER_INVALID);
      } else {
        await this.dbLogger.writeLogWithInfo(
          Log.COUPANG_EMAIL_AUTH_NUMBER_UNKNOWN_ERROR,
          JSON.stringify(res),
        );
      }
    }

    if (tokenForEmail === '') {
      await this.dbLogger.writeLog(Log.COUPANG_FAIL_TO_GET_TOKEN_FOR_EMAIL);
      return false;
    }

    // await this.sendAuthNumberToPhoneForConfirmation();
    // res = await this.verifyPhoneAuthNumberForConfirmation();

    const resText = await this.requestSubAccount(
      index,
      _ctk,
      tokenForMobile,
      tokenForEmail,
    );
    console.log(`requestSubAccount: ${resText}`);
    const res = parseJsonOrEmpty(resText);
    //{"successful":false,"message":"UserID Duplicate","code":0}
    //"{\"successful\":true,\"message\":\"OK\",\"code\":0}"
    if (res.message && res.message === 'OK') {
      await this.dbLogger.writeLog(Log.COUPANG_SUCCEED_TO_CREATE_SUB_ACCOUNT);
      await this.redisClient.set(this.redisClient.getSubAccountKey(), 'true');
      await this.redisClient.incrSubAccountNumber(index);
      return true;
    } else {
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_FAIL_TO_CREATE_SUB_ACCOUNT,
        JSON.stringify(res),
      );
      await this.redisClient.set(this.redisClient.getSubAccountKey(), 'false');
      if (res.message === 'UserID Duplicate') {
        await this.redisClient.incrSubAccountNumber(index);
      }
      return false;
    }
  }

  async sendAuthNumberToPhone(index: number): Promise<number> {
    const phoneNumber = SUB_ACCOUNT_CONTACTS[index].tel;
    this.PHONE_SEND_PAYLOAD.contact = '82 ' + phoneNumber;

    const options = {
      headers: this.HEADERS,
      data: this.PHONE_SEND_PAYLOAD,
    };

    const curTimestamp = Date.now();
    await this.scrapeWright.post(this.PHONE_SEND_API, options);
    await this.dbLogger.writeLog(Log.COUPANG_SEND_AUTH_NUMBER_TO_PHONE);

    return curTimestamp;
  }

  async verifyPhoneAuthNumber(
    index: number,
    curTimestamp: number,
  ): Promise<any> {
    const phoneNumber = SUB_ACCOUNT_CONTACTS[index].tel;

    const json = await this.redisClient.brpopInCoupangSMS(
      index,
      AUTH_TIMEOUT,
      curTimestamp,
    );
    if (json === null) {
      await this.dbLogger.writeLog(Log.COUPANG_PHONE_AUTH_NUMBER_TIMEOUT);
      return 'false';
    } else {
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_PHONE_AUTH_NUMBER_NOTIFIED,
        json.data,
      );
    }
    this.PHONE_SEND_VERIFY_PAYLOAD.contact = '82 ' + phoneNumber;
    this.PHONE_SEND_VERIFY_PAYLOAD.authNumber = json.data;

    const options = {
      headers: this.HEADERS,
      data: this.PHONE_SEND_VERIFY_PAYLOAD,
    };

    const body = await this.scrapeWright.post(
      this.PHONE_SEND_VERIFY_API,
      options,
    );
    return body;
  }

  async sendAuthNumberToEmail(index: number): Promise<number> {
    const email = SUB_ACCOUNT_CONTACTS[index].email;
    this.EMAIL_SEND_PAYLOAD.contact = email;

    const options = {
      headers: this.HEADERS,
      data: this.EMAIL_SEND_PAYLOAD,
    };

    const curTimestampInSec = Math.floor(Date.now() / 1000) - 1;
    await this.scrapeWright.post(this.EMAIL_SEND_API, options);
    await this.dbLogger.writeLog(Log.COUPANG_SEND_AUTH_NUMBER_TO_EMAIL);

    return curTimestampInSec;
  }

  async verifyEmailAuthNumber(
    index: number,
    curTimestampInSec: number,
  ): Promise<any> {
    const email = SUB_ACCOUNT_CONTACTS[index].email;
    const client = new GmailClient();

    const authNumber = await client.getLatestSixDigitCodeFromLabel(
      curTimestampInSec,
      index,
    );

    if (authNumber === null) {
      await this.dbLogger.writeLog(Log.COUPANG_FAIL_TO_GET_EMAIL_AUTH_NUMBER);
      return 'false';
    } else {
      await this.dbLogger.writeLogWithInfo(
        Log.COUPANG_SUCCEED_TO_GET_EMAIL_AUTH_NUMBER,
        authNumber,
      );
    }

    this.EMAIL_VERIFY_PAYLOAD.contact = email;
    this.EMAIL_VERIFY_PAYLOAD.authNumber = authNumber;

    const options = {
      headers: this.HEADERS,
      data: this.EMAIL_VERIFY_PAYLOAD,
    };

    const body = await this.scrapeWright.post(this.EMAIL_VERIFY_API, options);
    return body;
  }

  async sendAuthNumberToPhoneForConfirmation(): Promise<void> {
    const options = {
      headers: this.HEADERS,
      data: this.PHONE_CONFIRM_PAYLOAD,
    };

    await this.scrapeWright.post(this.PHONE_CONFIRM_API, options);
  }

  async verifyPhoneAuthNumberForConfirmation(
    curTimestamp: number,
  ): Promise<any> {
    await this.sendMessage({
      action: true,
      type: OperationType.SMS,
      timestamp: Date.now(),
    });
    const json = await this.waitMessage(AUTH_TIMEOUT);

    if (json === null) {
      await this.dbLogger.writeLog(Log.COUPANG_CONFIRMATION_SMS_AUTH_TIMEOUT);
      return false;
    } else {
      await this.dbLogger.writeLog(Log.COUPANG_CONFIRMATION_SMS_AUTH_NOTIFIED);
    }

    console.log(`authNumber: ${json.data}`);

    this.PHONE_CONFIRM_VERIFY_PAYLOAD.authNumber = json.data;

    const options = {
      headers: this.HEADERS,
      data: this.PHONE_CONFIRM_VERIFY_PAYLOAD,
    };

    const body = await this.scrapeWright.post(
      this.PHONE_CONFIRM_VERIFY_API,
      options,
    );
    return body;
  }

  async requestSubAccount(
    index: number,
    ctk: string,
    tokenForMobile: string,
    tokenForEmail: string,
  ): Promise<any> {
    const subAccountNumber = await this.redisClient.getSubAccountNumber(index);
    const subUserId = `${SUB_ACCOUNT_CONTACTS[index].idPrefix}${subAccountNumber}`;
    await this.redisClient.set(this.redisClient.getSubUserIdKey(), subUserId);
    const subPassword = this.generateRandomPassword();
    await this.redisClient.set(
      this.redisClient.getSubPasswordKey(),
      subPassword,
    );
    const phoneNumber = SUB_ACCOUNT_CONTACTS[index].tel;
    const email = SUB_ACCOUNT_CONTACTS[index].email;
    const form = {
      _ctk: ctk,
      tokenForMobile: tokenForMobile,
      tokenForEmail: tokenForEmail,
      userId: subUserId,
      userName: SUB_USER_NAME,
      password: subPassword,
      repeatPw: subPassword,
      phoneCountryCode: '82',
      phone: phoneNumber,
      mobileCountryCode: '82',
      mobile: phoneNumber,
      email: email,
      privacyAgreement: 'on',
    };

    console.log(`Requesting sub account with form: ${JSON.stringify(form)}`);

    const options = {
      headers: this.HEADERS,
      form: form,
    };

    await this.dbLogger.writeLog(Log.COUPANG_SEND_SUB_ACCOUNT_REQUEST);
    const body = await this.scrapeWright.postWithTextRes(
      this.CREATE_API,
      options,
    );

    return body;
  }

  async process(): Promise<any> {
    const data = {
      action: false,
      type: StatusType.TIMEOUT,
    };
    setTimeout(
      async () => {
        await this.sendMessage(data);
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
      if (!matchedBizNo) {
        return false;
      }

      await this.sendMessage({
        action: false,
        type: StatusType.COMPLETED,
      });

      const success = await this.createSubAccount();

      if (success && this.includeVat) {
        const vatData = await this.scrapeVat(this.startYm, this.endYm);

        await this.redisClient.set(
          this.redisClient.getVatDataKey(),
          JSON.stringify(vatData),
        );
      }

      return success;
    } catch (e) {
      await this.sendMessage({
        action: false,
        type: StatusType.TEMPORARY_ERROR,
      });
      await this.dbLogger.writeLogWithInfo(
        Log.TEMPORARY_ERROR,
        e instanceof Error ? e.message : String(e),
      );
      return false;
    }
  }

  generateRandomPassword(): string {
    const length = Math.floor(Math.random() * 8) + 8;
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const specials = '!@#$%^&*';

    let password = [
      lower[Math.floor(Math.random() * lower.length)],
      upper[Math.floor(Math.random() * upper.length)],
      numbers[Math.floor(Math.random() * numbers.length)],
      specials[Math.floor(Math.random() * specials.length)],
    ];

    const all = lower + upper + numbers + specials;
    for (let i = password.length; i < length; i++) {
      password.push(all[Math.floor(Math.random() * all.length)]);
    }

    return password.sort(() => Math.random() - 0.5).join('');
  }
}

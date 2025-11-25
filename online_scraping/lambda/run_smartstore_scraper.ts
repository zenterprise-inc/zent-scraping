import { SmartStoreScraper } from './smartstore_scraper';

const IS_NAVER_ACCOUNT = process.env.IS_NAVER_ACCOUNT === 'true';
const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';
const BIZ_NO = process.env.BIZ_NO || '';

(async () => {
  // subAccountName 한글, 영문 대문자, 영문 소문자, 문자사이 공백만 입력 가능합니다.
  const smartStoreScraper = new SmartStoreScraper(
    IS_NAVER_ACCOUNT,
    USER_ID,
    PASSWORD,
    BIZ_NO,
    '비즈넵케어',
    '01057472674',
    true,
  );

  await smartStoreScraper.run();
})();

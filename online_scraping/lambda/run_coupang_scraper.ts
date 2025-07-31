import { OnlineMall } from './online_mall';
import { CoupangScraper } from './coupang_scraper';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';
const BIZ_NO = process.env.BIZ_NO || '';

(async () => {
  // id- 6~20자의 영문 소문자, 숫자와 특수기호(_),(-),(.)만 입력해주세요.
  const coupangScraper = new CoupangScraper(
    OnlineMall.Coupang,
    USER_ID,
    PASSWORD,
    BIZ_NO,
  );
  await coupangScraper.run();
})();

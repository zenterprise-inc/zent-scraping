import { OnlineMall } from './online_mall';
import { CoupangScraper } from './coupang_scraper';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';
const BSNO = process.env.BSNO || '';

(async () => {
  // id- 6~20자의 영문 소문자, 숫자와 특수기호(_),(-),(.)만 입력해주세요.
  const coupangScraper = new CoupangScraper(
    OnlineMall.Coupang,
    USER_ID,
    PASSWORD,
    BSNO,
  );
  await coupangScraper.run();
})();

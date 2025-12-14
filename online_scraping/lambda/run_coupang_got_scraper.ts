import { CoupangGotScraper } from './coupang_got_scraper';
import dns from 'node:dns';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';
const BSNO = process.env.BSNO || '';

(async () => {
  dns.setDefaultResultOrder('ipv4first');
  // id- 6~20자의 영문 소문자, 숫자와 특수기호(_),(-),(.)만 입력해주세요.
  const coupangGotScraper = new CoupangGotScraper(USER_ID, PASSWORD, BSNO);
  await coupangGotScraper.run();
})();

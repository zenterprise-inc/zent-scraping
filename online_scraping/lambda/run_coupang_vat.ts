import { OnlineMall } from './online_mall';
import { CoupangVat } from './coupang_vat';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';
const BIZ_NO = process.env.BIZ_NO || '';

(async () => {
  const coupangVat = new CoupangVat(
    OnlineMall.Coupang,
    USER_ID,
    PASSWORD,
    BIZ_NO,
    '202501',
    '202506',
  );
  await coupangVat.run();
})();

import { CoupangSubAccountVat } from './coupang_sub_account_vat';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';

(async () => {
  const coupangSubAccountVat = new CoupangSubAccountVat(
    USER_ID,
    PASSWORD,
    '202501',
    '202506',
  );
  await coupangSubAccountVat.run();
})();

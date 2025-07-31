import { SmartStoreSubAccountVat } from './smartstore_sub_account_vat';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';
const BIZ_NO = process.env.BIZ_NO || '';

(async () => {
  const smartStoreSubAccountVat = new SmartStoreSubAccountVat(
    USER_ID,
    PASSWORD,
    BIZ_NO,
    ['100264951'],
  );

  await smartStoreSubAccountVat.run();
})();

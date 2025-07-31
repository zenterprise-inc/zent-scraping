import { SmartStoreVat } from './smartstore_vat';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';

(async () => {
  // subAccountName 한글, 영문 대문자, 영문 소문자, 문자사이 공백만 입력 가능합니다.
  const smartStoreVat = new SmartStoreVat(
    USER_ID,
    PASSWORD,
    '202501',
    '202506',
  );

  await smartStoreVat.run();
})();

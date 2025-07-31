import { OnlineMall } from './online_mall';
import { SmartStoreSubAccount } from './smartstore_sub_account';

const USER_ID = process.env.SMARTSTORE_USER_ID || '';
const PASSWORD = process.env.SMARTSTORE_PASSWORD || '';

(async () => {
  const subAccount = new SmartStoreSubAccount(
    OnlineMall.SmartStore,
    USER_ID,
    PASSWORD,
    '0000000000',
  );
  await subAccount.run();
})();

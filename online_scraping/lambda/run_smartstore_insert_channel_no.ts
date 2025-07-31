import { SmartInsertChannelNo } from './smartstore_insert_channel_no';

const USER_ID = process.env.USER_ID || '';
const PASSWORD = process.env.PASSWORD || '';

(async () => {
  const smartInsertChannelNo = new SmartInsertChannelNo(
    USER_ID,
    PASSWORD,
  );

  await smartInsertChannelNo.run();
})();

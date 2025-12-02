import { OperationType, StatusType } from '../redis';

export type ScrapingMessage = {
  action?: boolean;
  type: OperationType | StatusType;
  data?: any;
  timestamp?: number;
  authTimestamp?: number;
};

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({});
const QUEUE_URL = process.env.QUEUE_URL!;

export const handler = async (event: any) => {
    if (!QUEUE_URL) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'QUEUE_URL is not set' }),
        };
    }

    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Request body is required' }),
        };
    }

    const body = JSON.parse(event.body);
    const msg = body.key || '';

    if(msg === '') {
        return {
            statusCode: 400, 
            body: JSON.stringify({ message: 'msg is required' }),
        };
    }

    const urls: string[] = extractUrls(msg);

    if (urls.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'No url found in the message' }),
        };
    }


    await sqs.send(new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: urls[0],
    }));

    return {
        statusCode: 200,
        body: JSON.stringify({ message: `Message sent to SQS: ${urls[0]}` }),
    };
};

function extractUrls(text: string): string[] {
  const urlPattern: RegExp = /https?:\/\/[^\s]+/g;
  return text.match(urlPattern) || [];
}


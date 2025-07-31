import {createClient, RedisClientType} from 'redis';
import axios from 'axios';

let client: RedisClientType | null = null;

async function connectRedis() {
    if (!client) {
        client = createClient({
            url: 'rediss://scraping-redis-i41fut.serverless.apn2.cache.amazonaws.com:6379',
            socket: {
                tls: true,
            },
        });
        client.on('error', (err) => console.error('Redis error:', err));
        await client.connect();
    }
    return client;
}

function extractSixDigitCode(msg: string): string[] {
    const matches = msg.match(/\b\d{6}\b/g);
    return matches || [];
}

export const handler = async (event: any) => {
    const body = JSON.parse(event.body);
    const msg = body.key || '';
    const index = body.index || null;


    if (msg === '') {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'msg is required'}),
        };
    }

    if (!index) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'index is required'}),
        };
    }

    const codes = extractSixDigitCode(msg);
    if (codes.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({message: 'No 6-digit code found in the message'}),
        };
    }
    const authCode = codes[0];

    const value = {
        data: authCode,
        timestamp: Date.now(),
    }

    const KEY = `coupangSMS${index}`;
    const redis = await connectRedis();
    await redis.lPush(KEY, JSON.stringify(value));

    const webhookUrl =
        'https://hooks.slack.com/services/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';

    const payload = {
        text: authCode,
        username: 'WebhookBot',
        icon_emoji: ':robot_face:',
    };

    try {
        const response = await axios.post(webhookUrl, payload);
        console.log('Webhook 전송 성공:', response.data);
    } catch (error) {
        console.error('Webhook 전송 실패:', error);
    }


    return {
        statusCode: 200,
        body: JSON.stringify(value),
    };
};

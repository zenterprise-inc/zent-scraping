import axios from 'axios';

export const handler = async (event: any) => {
    try {
        console.log('Event:', JSON.stringify(event, null, 2));
        let url: string | undefined;

        if (event.queryStringParameters && event.queryStringParameters.url) {
            url = event.queryStringParameters.url;
        } else if (event.body) {
            const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
            url = body.url;
        }

        if (!url) {
            console.log('Error: URL parameter is required');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'URL parameter is required' }),
            };
        }

        const startTime = Date.now();
        let response;
        let error: any = null;

        try {
            response = await axios.get(url, {
                timeout: 30000,
                validateStatus: () => true,
            });
        } catch (err) {
            error = err;
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        if (error) {
            console.log('Connection Error:', {
                url,
                error: error.message,
                code: error.code,
                duration: `${duration}ms`,
            });
            return {
                statusCode: 500,
                body: JSON.stringify({ error: error.message }),
            };
        }

        if (response) {
            const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            console.log('Response HTML:', html);
            
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/html',
                },
                body: html,
            };
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'No response received' }),
        };
    } catch (err: any) {
        console.log('Handler Error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message || 'An unexpected error occurred' }),
        };
    }
};


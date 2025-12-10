import {CoupangSubAccountVat} from "./coupang_sub_account_vat";

export const handler = async (event: any) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    let res;
    try {
        if (!event.body) {
            return {
                statusCode: 400,
                body: { message: 'Request body is required' },
            };
        }

        const body = event.body;

        const userId = body.userId || '';

        if(userId === '') {
            return {
                statusCode: 400, 
                body: { message: 'userId is required' },
            };
        }

        const password = body.password || '';

        if(password === '') {
            return {
                statusCode: 400, 
                body: { message: 'password is required' },
            };
        }

        const startYm = body.startYm || '';
        const endYm = body.endYm || '';
        
        const coupangSubAccountVat = new CoupangSubAccountVat(userId, password, startYm, endYm);
        res = await coupangSubAccountVat.run();
    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            body: { message: error?.message || 'Internal server error' },
        };
    }

   
    return {
        statusCode: 200,
        body: res,
    };
};




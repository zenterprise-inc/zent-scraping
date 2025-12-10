import {SmartStoreVat} from "./smartstore_vat";

export const handler = async (event: any) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    let res;
    try {
     
        const userId = process.env.SMARTSTORE_SUB_ACCOUNT || '';
        if (userId === '') {
            return {
                statusCode: 400,
                body: {message: 'userId is required'},
            };
        }

        const password = process.env.SMARTSTORE_SUB_PASSWORD || '';
        if (password === '') {
            return {
                statusCode: 400,
                body: {message: 'password is required'},
            };
        }

        const smartStoreVat = new SmartStoreVat(userId, password);
        res = await smartStoreVat.run();
    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            body: {message: error?.message || 'Internal server error'},
        };
    }


    return {
        statusCode: 200,
        body: res,
    };
};




import {SmartStoreSubAccountVat} from "./smartstore_sub_account_vat";


export const handler = async (event: any) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    let res;
    try {
        if (!event.body) {
            return {
                statusCode: 400,
                body: {message: 'Request body is required'},
            };
        }

        const body = event.body;

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

        const bizNo = body.bizNo || '';

        if (bizNo === '') {
            return {
                statusCode: 400,
                body: {message: 'bizNo is required'},
            };
        }

        const channelNos = body.channelNos || '';
        if (channelNos === '') {
            return {
                statusCode: 400,
                body: {message: 'channelNos is required'},
            };
        }

        const startYm = body.startYm || '';
        const endYm = body.endYm || '';

        const smartStoreSubAccountVat = new SmartStoreSubAccountVat(userId, password, bizNo, channelNos, startYm, endYm);
        res = await smartStoreSubAccountVat.run();
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




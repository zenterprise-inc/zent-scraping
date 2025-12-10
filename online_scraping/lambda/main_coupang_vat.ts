import {CoupangVat} from "./coupang_vat";
import {OnlineMall} from "./online_mall";

export const handler = async (event: any) => {
    
    let res;
    try {
        const coupangVat = new CoupangVat(OnlineMall.Coupang,
            'coupangVat',
            'coupangVat',
            '0000000000');
        res = await coupangVat.run();
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




import { OnlineMall } from "./online_mall";
import { CoupangScraper } from "./coupang_scraper";



export const handler = async (event: any) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    try {
        if (!event.body) {
            return {
                statusCode: 400,
                body: { message: 'Request body is required' },
            };
        }

        const body = event.body;
        const mall = body.mall || '';

        if(mall === '') {
            return {
                statusCode: 400, 
                body: { message: 'mall is required' },
            };
        }

        const onlineMall = toOnlineMall(mall);
        if(onlineMall === undefined) {
            return {
                statusCode: 400, 
                body: { message: 'mall is undefined' },
            };
        }

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

        const bizNo = body.bizNo || '';

        if(bizNo === '') {
            return {
                statusCode: 400, 
                body: { message: 'bizNo is required' },
            };
        }

        const includeVat = body.includeVat || false;
        const startYm = body.startYm || '';
        const endYm = body.endYm || '';

        
        const coupangScraper = new CoupangScraper(onlineMall, userId, password, bizNo, includeVat, startYm, endYm);
        await coupangScraper.run();
    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            body: { message: error?.message || 'Internal server error' },
        };
    }

   
    return {
        statusCode: 200,
        body: { message: `executed` },
    };
};

function toOnlineMall(mall: string): OnlineMall | undefined {
    return Object.values(OnlineMall).includes(mall as OnlineMall)
    ? (mall as OnlineMall)
    : undefined;
}



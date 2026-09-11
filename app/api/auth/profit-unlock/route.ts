import {checkOrigin,endpoint,jsonBody,unlockProfit} from '@/server/auth';
export const runtime='nodejs';
export async function POST(request:Request){return endpoint(async()=>{checkOrigin(request);return unlockProfit(await jsonBody(request));});}

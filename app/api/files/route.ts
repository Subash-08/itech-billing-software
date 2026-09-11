import {checkOrigin,endpoint,requireIdentity} from '@/server/auth';
import {AppError} from '@/server/db';
import {storeFile} from '@/server/storage';
export const runtime='nodejs';
export async function POST(request:Request){return endpoint(async()=>{checkOrigin(request);const identity=await requireIdentity();const size=Number(request.headers.get('content-length'));if(!Number.isFinite(size)||size<=0||size>11*1024*1024)throw new AppError(413,'Upload must have a known size below 11 MB.');const form=await request.formData();const file=form.get('file');if(!(file instanceof File))throw new AppError(400,'Select a file.');return storeFile(identity,file);});}

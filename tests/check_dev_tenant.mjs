import {MongoClient} from 'mongodb';

process.loadEnvFile('.env.local');
const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');

const user = await db.collection('authUsers').findOne({email: 'test@gmail.com'});
const tenantId = user?.tenantId;

const supplier = await db.collection('suppliers').findOne({tenantId});
const product = await db.collection('products').findOne({tenantId});

console.log('SUPPLIER:', supplier?.name, supplier?._id);
console.log('PRODUCT:', product?.name, product?._id, product?.stock);

await client.close();

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const token = process.env.DALIVE_BEARER_TOKEN;
const url = 'https://admin.da.live/api/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';

const response = await axios.get(url, {
  headers: { 'Authorization': 'Bearer ' + token },
  timeout: 10000,
});

console.log('Status:', response.status);
console.log('Content-Type:', response.headers['content-type']);
console.log('Data type:', typeof response.data);
console.log('\nFirst 500 chars:');
console.log(response.data.substring(0, 500));
console.log('\n...\n');
console.log('Last 200 chars:');
console.log(response.data.substring(response.data.length - 200));

require('dotenv').config({ path: '.env.local' });
const apiKey = process.env.MICROCMS_API_KEY;
const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;

async function testUpdate() {
  const body = JSON.stringify({ content: 'test update' });
  
  const response = await fetch(`https://${serviceDomain}.microcms.io/api/v1/posts/sl0j3_4uf6`, {
    method: 'PUT',
    headers: {
      'X-MICROCMS-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body,
  });

  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text);
}

testUpdate();

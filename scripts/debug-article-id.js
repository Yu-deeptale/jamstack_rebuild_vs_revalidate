require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.MICROCMS_API_KEY;
const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;

async function getArticleById() {
  try {
    const url = `https://${serviceDomain}.microcms.io/api/v1/posts?filters=slug[equals]ticket-Autumn2026`;
    console.log('Fetching from:', url);
    
    const response = await fetch(url, {
      headers: { 'X-MICROCMS-API-KEY': apiKey }
    });

    if (!response.ok) {
      console.error('HTTP Error:', response.status);
      const error = await response.json();
      console.error('Error details:', error);
      return;
    }

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getArticleById();

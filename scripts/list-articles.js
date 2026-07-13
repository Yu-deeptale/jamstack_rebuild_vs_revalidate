require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.MICROCMS_API_KEY;
const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;

async function listArticles() {
  try {
    const url = `https://${serviceDomain}.microcms.io/api/v1/posts?limit=100`;
    
    const response = await fetch(url, {
      headers: { 'X-MICROCMS-API-KEY': apiKey }
    });

    if (!response.ok) {
      console.error('HTTP Error:', response.status);
      return;
    }

    const data = await response.json();
    const items = data.contents.slice(0, 5);
    
    items.forEach(item => {
      console.log('ID:', item.id, '| Slug:', item.slug);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listArticles();

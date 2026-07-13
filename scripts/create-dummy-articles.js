require('dotenv').config({ path: '.env.local' });

const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
const apiKey = process.env.MICROCMS_API_KEY;

if (!serviceDomain || !apiKey) {
  console.error('❌ Error: MICROCMS_SERVICE_DOMAIN or MICROCMS_API_KEY is not set');
  process.exit(1);
}

const API_BASE = `https://${serviceDomain}.microcms.io/api/v1`;
const ENDPOINT = 'posts';

/**
 * 記事を作成
 */
async function createArticle(title, slug, content) {
  try {
    const response = await fetch(`${API_BASE}/${ENDPOINT}`, {
      method: 'POST',
      headers: {
        'X-MICROCMS-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        slug,
        content,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`❌ Failed to create article (${slug}):`, error.message);
    throw error;
  }
}

/**
 * 月を計算（YYYY-MM 形式）
 * startDate から count ヶ月進めた日付を返す
 */
function getMonthString(startDate, offset) {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + offset);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  return `${year}-${month}`;
}

/**
 * メイン処理
 */
async function main() {
  const count = 50;
  const startDate = new Date('2026-10-01'); // 2026年10月から開始
  const baseTitle = '【チケット】マンスリーフェス';
  const baseSlug = 'ticket-Monthly';
  const content = '今月のマンスリーフェスには10組のアーティストが出演予定！詳細は続報をお待ちください。';

  console.log(`\n🚀 Starting to create ${count} dummy articles...\n`);
  console.log(`📋 Details:`);
  console.log(`   Service Domain: ${serviceDomain}`);
  console.log(`   Endpoint: ${ENDPOINT}`);
  console.log(`   Start Date: ${startDate.toISOString()}`);
  console.log(`   Count: ${count}\n`);

  const createdArticles = [];
  const failedArticles = [];

  for (let i = 0; i < count; i++) {
    const monthString = getMonthString(startDate, i);
    const title = `${baseTitle}${monthString}`;
    const slug = `${baseSlug}${monthString}`;

    console.log(`[${i + 1}/${count}] Creating: "${title}" (${slug})...`);

    try {
      const article = await createArticle(title, slug, content);
      createdArticles.push({
        id: article.id,
        title,
        slug,
        createdAt: article.createdAt,
      });
      console.log(`   ✅ Created successfully (ID: ${article.id})\n`);

      // API レート制限を避けるために、少し待機
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      failedArticles.push({ title, slug, error: error.message });
      console.log(`   ❌ Failed\n`);
    }
  }

  // 結果サマリー
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully created: ${createdArticles.length}/${count}`);
  console.log(`❌ Failed: ${failedArticles.length}/${count}`);

  if (createdArticles.length > 0) {
    console.log('\n📝 Created Articles:');
    createdArticles.forEach((article, index) => {
      console.log(`   ${index + 1}. ${article.title} (${article.slug})`);
    });
  }

  if (failedArticles.length > 0) {
    console.log('\n⚠️  Failed Articles:');
    failedArticles.forEach((article, index) => {
      console.log(`   ${index + 1}. ${article.title} (${article.slug})`);
      console.log(`      Error: ${article.error}`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');

  process.exit(failedArticles.length > 0 ? 1 : 0);
}

main();

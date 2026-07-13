require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const config = require('./measure-config');

// 環境変数をセット
process.env.NETLIFY_ACCESS_TOKEN = process.env.NETLIFY_ACCESS_TOKEN || 'nfp_i5D9VA4dGh3pvfc4VZvUoaZPwnFtHSSt0569';

const MICROCMS_API = `https://${config.microcms.serviceDomain}.microcms.io/api/v1`;
const NETLIFY_API = config.netlify.apiBaseUrl;

/**
 * microCMS の記事を更新（PATCH を使用）
 */
async function updateArticle(articleId, testNumber) {
  const timestamp = new Date().toISOString();
  const content = `測定開始: ${timestamp} (Test #${testNumber})`;

  try {
    const response = await fetch(`${MICROCMS_API}/${config.microcms.endpoint}/${articleId}`, {
      method: 'PATCH',
      headers: {
        'X-MICROCMS-API-KEY': config.microcms.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update article: ${response.status} - ${errorText}`);
    }

    return { timestamp, content };
  } catch (error) {
    console.error(`❌ Failed to update article (${articleId}):`, error.message);
    throw error;
  }
}

/**
 * Netlify の最新ビルド情報を取得
 */
async function getLatestBuild() {
  try {
    const response = await fetch(`${NETLIFY_API}/sites/${config.netlify.siteId}/builds?per_page=1`, {
      headers: {
        'Authorization': `Bearer ${process.env.NETLIFY_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch builds: ${response.status}`);
    }

    const data = await response.json();
    return data[0]; // 最新ビルド
  } catch (error) {
    console.error('❌ Failed to get latest build:', error.message);
    throw error;
  }
}

/**
 * ビルド完了を待機
 */
async function waitForBuildCompletion(initialBuildId, timeout = config.measurement.buildTimeout) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5秒ごとにポーリング

  console.log(`   ⏳ Waiting for build completion... (timeout: ${timeout / 1000}s)`);

  while (Date.now() - startTime < timeout) {
    try {
      const latestBuild = await getLatestBuild();

      if (latestBuild.id !== initialBuildId && latestBuild.state === 'ready') {
        const duration = Date.now() - startTime;
        console.log(`   ✅ Build completed in ${(duration / 1000).toFixed(2)}s`);
        return {
          buildId: latestBuild.id,
          duration,
          completedAt: new Date(latestBuild.published_at),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('   Error polling build status:', error.message);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Build did not complete within ${timeout / 1000}s`);
}

/**
 * Step1: オンデマンド再検証を計測
 */
async function measureStep1(articleId, testNumber) {
  console.log(`\n📊 [Step1] Test #${testNumber} - On-Demand Revalidation`);
  console.log(`   Article ID: ${articleId}`);

  const updateStartTime = Date.now();
  const { timestamp: updateTime } = await updateArticle(articleId, testNumber);

  console.log(`   📝 Article updated at: ${updateTime}`);

  // Webhook 受信を待つ
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(`   🔄 Calling /api/revalidate...`);

  const revalidateStartTime = Date.now();
  try {
    const response = await fetch(config.revalidateApi.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ id: articleId }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const revalidateDuration = Date.now() - revalidateStartTime;
    console.log(`   ✅ Revalidation completed in ${revalidateDuration}ms`);

    return {
      method: 'Step1',
      testNumber,
      articleId,
      updateTime,
      revalidateDuration,
      success: true,
    };
  } catch (error) {
    console.error(`   ❌ Revalidation failed:`, error.message);
    return {
      method: 'Step1',
      testNumber,
      articleId,
      updateTime,
      revalidateDuration: -1,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Step2: フル再ビルドを計測
 */
async function measureStep2(articleId, testNumber) {
  console.log(`\n📊 [Step2] Test #${testNumber} - Full Rebuild`);
  console.log(`   Article ID: ${articleId}`);

  const { timestamp: updateTime } = await updateArticle(articleId, testNumber);

  console.log(`   📝 Article updated at: ${updateTime}`);

  // ビルド開始前の状態を取得
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const initialBuild = await getLatestBuild();
  console.log(`   📦 Initial build ID: ${initialBuild.id}`);

  // ビルド完了を待機
  try {
    const { duration } = await waitForBuildCompletion(initialBuild.id);

    return {
      method: 'Step2',
      testNumber,
      articleId,
      updateTime,
      buildDuration: duration,
      success: true,
    };
  } catch (error) {
    console.error(`   ❌ Build failed:`, error.message);
    return {
      method: 'Step2',
      testNumber,
      articleId,
      updateTime,
      buildDuration: -1,
      success: false,
      error: error.message,
    };
  }
}

/**
 * CSV に結果を出力
 */
function appendResultsToCsv(results) {
  const csvPath = config.output.csvPath;
  const dir = path.dirname(csvPath);

  // ディレクトリが存在しなければ作成
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ヘッダーを確認
  const hasHeader = fs.existsSync(csvPath);

  let csvContent = '';
  if (!hasHeader) {
    csvContent = 'Method,Test#,Article ID,Update Time,Duration(ms),Success,Note\n';
  }

  results.forEach((result) => {
    const duration = result.revalidateDuration ?? result.buildDuration;
    const row = `${result.method},${result.testNumber},${result.articleId},${result.updateTime},${duration},${result.success},${result.error || ''}`;
    csvContent += row + '\n';
  });

  if (hasHeader) {
    fs.appendFileSync(csvPath, csvContent);
  } else {
    fs.writeFileSync(csvPath, csvContent);
  }

  console.log(`\n📄 Results appended to: ${csvPath}`);
}

/**
 * メイン処理
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Starting Performance Measurement');
  console.log('='.repeat(60));

  const testCount = config.measurement.testCount;
  const articleIds = config.microcms.testArticleIds;
  const allResults = [];

  for (let i = 1; i <= testCount; i++) {
    const articleIndex = (i - 1) % articleIds.length;
    const articleId = articleIds[articleIndex];

    // Step1 と Step2 を交互に実行
    const isStep1 = i % 2 === 1;

    try {
      if (isStep1) {
        const result = await measureStep1(articleId, i);
        allResults.push(result);
      } else {
        const result = await measureStep2(articleId, i);
        allResults.push(result);
      }
    } catch (error) {
      console.error(`\n❌ Test #${i} failed:`, error.message);
    }

    // 次のテストまで待機
    if (i < testCount) {
      console.log(`\n⏳ Waiting ${config.measurement.delayBetweenTests}ms before next test...`);
      await new Promise((resolve) => setTimeout(resolve, config.measurement.delayBetweenTests));
    }
  }

  // 結果を CSV に出力
  appendResultsToCsv(allResults);

  // サマリーを表示
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total tests: ${testCount}`);
  console.log(`Successful: ${allResults.filter((r) => r.success).length}`);
  console.log(`Failed: ${allResults.filter((r) => !r.success).length}`);

  const step1Results = allResults.filter((r) => r.method === 'Step1' && r.success);
  const step2Results = allResults.filter((r) => r.method === 'Step2' && r.success);

  if (step1Results.length > 0) {
    const avg1 = step1Results.reduce((sum, r) => sum + r.revalidateDuration, 0) / step1Results.length;
    console.log(`\n📈 Step1 (Revalidate): ${avg1.toFixed(2)}ms (avg)`);
  }

  if (step2Results.length > 0) {
    const avg2 = step2Results.reduce((sum, r) => sum + r.buildDuration, 0) / step2Results.length;
    console.log(`📈 Step2 (Full Rebuild): ${(avg2 / 1000).toFixed(2)}s (avg)`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  process.exit(allResults.some((r) => !r.success) ? 1 : 0);
}

main();

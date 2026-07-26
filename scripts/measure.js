require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const config = require('./measure-config');

const MICROCMS_API = `https://${config.microcms.serviceDomain}.microcms.io/api/v1`;
const CLOUDFLARE_API = config.cloudflare.apiBaseUrl;

function getCloudflareProjectName() {
  if (config.cloudflare.projectName) {
    return config.cloudflare.projectName;
  }

  try {
    const hostname = new URL(config.revalidateApi.url).hostname;
    if (hostname.endsWith('.pages.dev')) {
      return hostname.replace('.pages.dev', '');
    }
  } catch {
    // URL から推測できない場合は下のエラーにフォールバック
  }

  throw new Error(
    'Cloudflare project name is not set. Add cloudflare.projectName to scripts/measure-config.js'
  );
}

function getCloudflareAuthHeaders() {
  if (!config.cloudflare.apiToken) {
    throw new Error('CLOUDFLARE_API_TOKEN is not set in .env.local');
  }

  return {
    'Authorization': `Bearer ${config.cloudflare.apiToken}`,
    'Content-Type': 'application/json',
  };
}

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
 * Cloudflare Pages の最新デプロイ情報を取得
 */
async function getLatestBuild() {
  try {
    const projectName = getCloudflareProjectName();
    const response = await fetch(
      `${CLOUDFLARE_API}/accounts/${config.cloudflare.accountId}/pages/projects/${projectName}/deployments?per_page=1`,
      {
        headers: getCloudflareAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch deployments: ${response.status} - ${errorText}`);
    }

    const payload = await response.json();
    if (!payload.success) {
      throw new Error(`Cloudflare API error: ${JSON.stringify(payload.errors || [])}`);
    }

    const deployment = payload.result?.[0];
    if (!deployment) {
      throw new Error('No deployment found for the project');
    }

    const stageStatus = deployment.latest_stage?.status || deployment.latest_stage?.name || deployment.stage || '';
    return {
      id: deployment.id,
      state: String(stageStatus).toLowerCase(),
      published_at: deployment.created_on,
      modified_on: deployment.modified_on || deployment.created_on,
      trigger_type: deployment.trigger?.type || '',
      environment: deployment.environment || deployment.deployment_trigger?.metadata?.branch || '',
      raw: deployment,
    };
  } catch (error) {
    console.error('❌ Failed to get latest deployment:', error.message);
    throw error;
  }
}

/**
 * Cloudflare Pages のプロジェクト設定を取得
 */
async function getProjectSettings() {
  const projectName = getCloudflareProjectName();
  const response = await fetch(
    `${CLOUDFLARE_API}/accounts/${config.cloudflare.accountId}/pages/projects/${projectName}`,
    {
      headers: getCloudflareAuthHeaders(),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch project settings: ${response.status} - ${errorText}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(payload.errors || [])}`);
  }

  return payload.result;
}

/**
 * Step2 実行前に build 設定を検査
 */
async function validateStep2Prerequisites() {
  const project = await getProjectSettings();
  const buildCommand = (project.build_config?.build_command || '').trim();

  if (!buildCommand) {
    throw new Error(
      'Cloudflare Pages build command is empty. Set build command to "npm ci && npm run build" in the Pages project settings.'
    );
  }
}

/**
 * ビルド完了を待機
 */
async function waitForBuildCompletion(initialBuildId, timeout = config.measurement.buildTimeout) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5秒ごとにポーリング
  const successStates = new Set(['success', 'deployed']);
  const failedStates = new Set(['failure', 'failed', 'canceled', 'cancelled', 'error']);
  const runningStates = new Set(['queued', 'pending', 'building', 'in_progress', 'running']);
  let observedNewBuildId = null;
  let queueDetectedAt = null;
  let buildStartedAt = null;

  console.log(`   ⏳ Waiting for build completion... (timeout: ${timeout / 1000}s)`);

  while (Date.now() - startTime < timeout) {
    try {
      const latestBuild = await getLatestBuild();
      const stages = Array.isArray(latestBuild.raw?.stages) ? latestBuild.raw.stages : [];
      const normalize = (value) => String(value || '').toLowerCase();
      const deployStage = stages.find((stage) => stage.name === 'deploy');
      const buildStage = stages.find((stage) => stage.name === 'build');
      const hasFailedStage = stages.some((stage) => failedStates.has(normalize(stage.status)));
      const deploySucceeded = deployStage && successStates.has(normalize(deployStage.status));

      // 新しい build を検知
      if (latestBuild.id !== initialBuildId && !observedNewBuildId) {
        observedNewBuildId = latestBuild.id;
        queueDetectedAt = Date.now();
        console.log(
          `   🆕 New deployment detected: ${observedNewBuildId} (latest=${latestBuild.raw?.latest_stage?.name || 'unknown'}:${latestBuild.state})`
        );
      }

      // 新buildの進行状態を追跡
      if (observedNewBuildId && latestBuild.id === observedNewBuildId) {
        if (!buildStartedAt && buildStage?.started_on) {
          buildStartedAt = Date.parse(buildStage.started_on) || Date.now();
          console.log(`   🏗️ Build started (state=${normalize(buildStage.status) || latestBuild.state})`);
        } else if (!buildStartedAt && runningStates.has(latestBuild.state)) {
          buildStartedAt = Date.now();
          console.log(`   🏗️ Build started (state=${latestBuild.state})`);
        }

        if (hasFailedStage) {
          const latestName = latestBuild.raw?.latest_stage?.name || 'unknown';
          const latestStatus = normalize(latestBuild.raw?.latest_stage?.status || latestBuild.state);
          throw new Error(`Latest deployment failed (${latestName}:${latestStatus})`);
        }

        if (deploySucceeded) {
          const endAt = Date.now();
          const createdMs = Date.parse(latestBuild.published_at);
          const buildStartMs = buildStage?.started_on ? Date.parse(buildStage.started_on) : NaN;
          const buildEndMs = buildStage?.ended_on ? Date.parse(buildStage.ended_on) : NaN;
          const duration = endAt - startTime;
          const queueWait = Number.isFinite(createdMs) && Number.isFinite(buildStartMs)
            ? Math.max(0, buildStartMs - createdMs)
            : (queueDetectedAt ? (queueDetectedAt - startTime) : null);
          const runTime = Number.isFinite(buildStartMs) && Number.isFinite(buildEndMs)
            ? Math.max(0, buildEndMs - buildStartMs)
            : (buildStartedAt ? (endAt - buildStartedAt) : null);
          const completedAtIso = deployStage?.ended_on || latestBuild.modified_on || latestBuild.published_at;
          console.log(`   ✅ Build completed in ${(duration / 1000).toFixed(2)}s`);
          if (queueWait !== null) console.log(`   ⏱️ Queue detect: ${(queueWait / 1000).toFixed(2)}s`);
          if (runTime !== null) console.log(`   ⏱️ Build run   : ${(runTime / 1000).toFixed(2)}s`);
          return {
            buildId: latestBuild.id,
            duration,
            queueWaitMs: queueWait,
            buildRunMs: runTime,
            completedAt: new Date(completedAtIso),
          };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Latest deployment failed')) {
        throw error;
      }
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

  if (!config.cloudflare.deployHookUrl) {
    throw new Error('CLOUDFLARE_DEPLOY_HOOK_URL is not set in .env.local');
  }

  await validateStep2Prerequisites();

  // 先に現在の最新デプロイを取得（比較基準）
  const initialBuild = await getLatestBuild();
  console.log(`   📦 Initial build ID: ${initialBuild.id}`);

  const { timestamp: updateTime } = await updateArticle(articleId, testNumber);
  console.log(`   📝 Article updated at: ${updateTime}`);

  console.log(`   🚀 Triggering Cloudflare Pages deploy hook...`);
  const hookRes = await fetch(config.cloudflare.deployHookUrl, { method: 'POST' });
  if (!hookRes.ok) {
    throw new Error(`Deploy hook failed: ${hookRes.status}`);
  }

  // 更新反映のトリガー待ち
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // ビルド完了を待機
  try {
    const { duration, queueWaitMs, buildRunMs } = await waitForBuildCompletion(initialBuild.id);

    return {
      method: 'Step2',
      testNumber,
      articleId,
      updateTime,
      buildDuration: duration,
      queueWaitMs,
      buildRunMs,
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
    csvContent = 'Method,Test#,Article ID,Update Time,Duration(ms),QueueWait(ms),BuildRun(ms),Success,Note\n';
  }

  results.forEach((result) => {
    const duration = result.revalidateDuration ?? result.buildDuration;
    const row = `${result.method},${result.testNumber},${result.articleId},${result.updateTime},${duration},${result.queueWaitMs ?? ''},${result.buildRunMs ?? ''},${result.success},${result.error || ''}`;
    csvContent += row + '\n';
  });

  // 既存結果を毎回消して最新1回分だけを保存したい場合は以下を有効化
  // if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);

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
      const result = isStep1
        ? await measureStep1(articleId, i)
        : await measureStep2(articleId, i);
      allResults.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Test #${i} failed:`, errorMessage);
      allResults.push({
        method: isStep1 ? 'Step1' : 'Step2',
        testNumber: i,
        articleId,
        updateTime: new Date().toISOString(),
        revalidateDuration: isStep1 ? -1 : undefined,
        buildDuration: !isStep1 ? -1 : undefined,
        success: false,
        error: errorMessage,
      });
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

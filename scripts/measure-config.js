/**
 * 計測設定ファイル
 */

module.exports = {
  // microCMS 設定
  microcms: {
    serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
    apiKey: process.env.MICROCMS_API_KEY,
    endpoint: 'posts',
    // テスト用記事 ID（この 2 つを交互に更新）
    testArticleIds: [
      'sl0j3_4uf6',        // ticket-Autumn2026
      'ticket-summer2026'  // ticket-summer2026
    ],
  },

  // Cloudflare Pages 設定
  cloudflare: {
    accountId: '424f0f1d33ba71bc0745e8570dbb8737',
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    apiBaseUrl: 'https://api.cloudflare.com/client/v4',
    deployHookUrl: process.env.CLOUDFLARE_DEPLOY_HOOK_URL,
  },

  // 再検証 API 設定
  revalidateApi: {
    url: 'https://sys-jamstack.pages.dev/api/revalidate',
  },

  // 計測設定
  measurement: {
    testCount: 10, // テスト回数
    delayBetweenTests: 3000, // テスト間の遅延（ms）
    buildTimeout: 600000, // ビルド完了タイムアウト（10分）
    maxRetries: 3, // リトライ回数
  },

  // 出力設定
  output: {
    csvPath: './scripts/results/results.csv',
  },
};

/**
 * 計測設定ファイル
 */

module.exports = {
  // microCMS 設定
  microcms: {
    serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN,
    apiKey: process.env.MICROCMS_API_KEY,
    endpoint: 'posts',
    // テスト用記事スラッグ（この 2 つを交互に更新）
    testSlugs: [
      'ticket-Autumn2026',
      'ticket-summer2026'
    ],
  },

  // Netlify 設定
  netlify: {
    siteId: '49da18ca-643e-4610-84de-a6c430d3cc77', // syssemijam
    accessToken: process.env.NETLIFY_ACCESS_TOKEN,
    apiBaseUrl: 'https://api.netlify.com/api/v1',
  },

  // 再検証 API 設定
  revalidateApi: {
    url: 'https://syssemijam.netlify.app/api/revalidate',
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

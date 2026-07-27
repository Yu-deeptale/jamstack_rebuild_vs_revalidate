# jamstack_rebuild_vs_revalidate

Jamstack 運用における 2 つの更新戦略を比較する実験プロジェクトです。

- Step1: On-Demand Revalidation（`/api/revalidate` 呼び出し）
- Step2: Full Rebuild（Cloudflare Pages Deploy Hook で再デプロイ）

## プロジェクト概要

このプロジェクトは、microCMS の記事更新をトリガーにして以下を交互に実行し、更新反映までの時間を比較します。

1. Step1（オンデマンド再検証）
2. Step2（フル再ビルド）

計測結果は CSV に追記されます。

- 出力先: `scripts/results/results.csv`

## 前提条件

- Node.js 20 以上
- npm
- microCMS の API キーとテスト用記事
- Cloudflare Pages プロジェクト
- Cloudflare API Token（Pages 設定参照 + デプロイ監視が可能な権限）

## 最少手順（これだけで実験実行）

### 1) 依存関係をインストール

```bash
npm ci
```

### 2) `.env.local` を作成

以下の値を設定してください。

```env
MICROCMS_SERVICE_DOMAIN=your-service-domain
MICROCMS_API_KEY=your-microcms-api-key

CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_DEPLOY_HOOK_URL=https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...
```

### 3) 計測を実行

```bash
npm run measure
```

## よく使うコマンド

- 構文チェック: `npm run check:measure`
- 記事更新疎通テスト: `npm run test:update`
- 記事一覧取得: `npm run list:articles`

## 期待されるログ

- Step1 成功例: `Revalidation completed in ...ms`
- Step2 成功例:
	- `New deployment detected: ...`
	- `Build completed in ...s`
	- `Queue detect: ...s`
	- `Build run   : ...s`

## トラブルシュート

### `Cloudflare Pages build command is empty` が出る

Cloudflare Pages のプロジェクト設定で Build command を設定してください。

- 推奨: `npm ci && npm run build`

### Step1 が 404/405 になる

- 最新デプロイが `uses_functions=false` の可能性があります。
- `functions/api/revalidate.ts` を含むコミットを push してから Deploy Hook を実行してください。

### Push が secret scanning で拒否される

- `.env.local` はコミットしないでください（本リポジトリでは `.gitignore` 済み）。
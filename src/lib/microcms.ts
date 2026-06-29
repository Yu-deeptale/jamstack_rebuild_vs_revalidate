type MicroCMSListResponse<T> = {
  contents: T[];
  totalCount: number;
  offset: number;
  limit: number;
};

export type Post = {
  id: string;
  title: string;
  slug: string;
  content: string; // リッチエディタの場合、HTML文字列で返ってくる想定
  publishedAt?: string;
  updatedAt?: string;
};

const SERVICE_DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN;
const API_KEY = process.env.MICROCMS_API_KEY;

function requiredEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export async function fetchPosts(): Promise<Post[]> {
  let domain: string;
  let key: string;
  try {
    domain = requiredEnv("MICROCMS_SERVICE_DOMAIN", SERVICE_DOMAIN);
    key = requiredEnv("MICROCMS_API_KEY", API_KEY);
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    // 開発時に環境変数が未設定でもクラッシュさせず、空配列を返す
    return [];
  }

  const res = await fetch(`https://${domain}.microcms.io/api/v1/posts?limit=100`, {
    headers: { "X-MICROCMS-API-KEY": key },
    // まずはキャッシュで悩まないためにno-store（後でISR設計に合わせて調整）
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`fetchPosts failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as MicroCMSListResponse<Post>;
  return data.contents;
}

export async function fetchPostBySlug(slug: string): Promise<Post | null> {
  let domain: string;
  let key: string;
  try {
    domain = requiredEnv("MICROCMS_SERVICE_DOMAIN", SERVICE_DOMAIN);
    key = requiredEnv("MICROCMS_API_KEY", API_KEY);
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    // 環境変数未設定時は null を返す
    return null;
  }

  // filtersでslug一致のものを取る（microCMSの標準的な取り方）
  const q = new URLSearchParams({
    filters: `slug[equals]${slug}`,
    limit: "1",
  });

  const res = await fetch(`https://${domain}.microcms.io/api/v1/posts?${q.toString()}`, {
    headers: { "X-MICROCMS-API-KEY": key },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`fetchPostBySlug failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as MicroCMSListResponse<Post>;
  return data.contents[0] ?? null;
}
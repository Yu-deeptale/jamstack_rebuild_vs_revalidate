import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // リクエストボディを取得
  const body = await req.json();

  try {
    // microCMS から受け取ったデータをログ出力
    console.log('[Webhook] Received from microCMS:', {
      timestamp: new Date().toISOString(),
      body,
    });

    // microCMS のペイロードから slug を抽出
    const slug = body.contents?.[0]?.slug;

    if (!slug) {
      console.warn('[Webhook] No slug found in payload');
      return NextResponse.json(
        { message: 'No slug provided' },
        { status: 200 } // microCMS がリトライしないように 200 で返す
      );
    }

    // 対象ページを再検証
    console.log('[Revalidate] Starting revalidation...', {
      paths: ['/posts', `/posts/${slug}`],
      timestamp: new Date().toISOString(),
    });

    const startTime = Date.now();

    // 一覧ページを再検証
    await revalidatePath('/posts');
    console.log('[Revalidate] /posts revalidated');

    // 詳細ページを再検証
    await revalidatePath(`/posts/${slug}`);
    console.log('[Revalidate] /posts/' + slug + ' revalidated');

    const duration = Date.now() - startTime;

    console.log('[Revalidate] Completed', {
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        revalidated: true,
        timestamp: new Date().toISOString(),
        duration,
        paths: ['/posts', `/posts/${slug}`],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Webhook] Error during revalidation:', {
      error,
      timestamp: new Date().toISOString(),
    });

    // エラーが発生しても 200 で返す（microCMS がリトライしないようにするため）
    return NextResponse.json(
      {
        revalidated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}

// ヘルスチェック用（GET リクエスト）
export async function GET() {
  return NextResponse.json(
    {
      message: 'Revalidate endpoint is running',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

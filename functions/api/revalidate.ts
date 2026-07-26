interface RevalidateRequestBody {
  contents?: Array<string | { slug?: string }>;
}

function extractSlugs(body: RevalidateRequestBody): string[] {
  if (!Array.isArray(body.contents)) {
    return [];
  }

  return body.contents
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      return item?.slug;
    })
    .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  try {
    const body = (await context.request.json()) as RevalidateRequestBody;
    const slugs = extractSlugs(body);

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Revalidate webhook received on Pages Function',
        slugs,
        receivedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Invalid JSON payload',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }
    );
  }
}

export async function onRequestGet(): Promise<Response> {
  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Revalidate endpoint is running on Pages Functions',
      receivedAt: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }
  );
}

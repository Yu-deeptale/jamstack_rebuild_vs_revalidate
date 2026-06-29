import { notFound } from "next/navigation";
import { fetchPostBySlug } from "@/lib/microcms";

type Params = { slug: string };

export default async function PostDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);

  if (!post) return notFound();

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <h1>{post.title}</h1>

      {/* リッチエディタのHTMLを表示するため */}
      <div dangerouslySetInnerHTML={{ __html: post.content }} />

      <hr />
      <p style={{ color: "#666" }}>slug: {post.slug}</p>
    </main>
  );
}
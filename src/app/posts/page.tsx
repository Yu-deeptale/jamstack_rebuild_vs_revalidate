import Link from "next/link";
import { fetchPosts } from "@/lib/microcms";

export default async function PostsPage() {
  const posts = await fetchPosts();

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <h1>Posts</h1>

      {posts.length === 0 ? (
        <p>記事がありません。</p>
      ) : (
        <ul>
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/posts/${p.slug}`}>{p.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
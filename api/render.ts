import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Serves /blog, /blog/:slug and /sitemap-blog.xml (see vercel.json rewrites).
 * Stage 1: injects title, description, canonical, Open Graph, Twitter and JSON-LD into the built HTML shell,
 * and answers a real 404 for unknown slugs. The React app then renders the body in the browser.
 */
const SITE_URL = 'https://nenisys.shop';
const API_URL = (process.env.API_URL ?? 'https://api.nenisys.shop').replace(/\/+$/, '');
const OG_DEFAULT = `${SITE_URL}/og-image.png`;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

let shell: string | undefined;
async function getShell(origin: string): Promise<string> {
  if (shell) return shell;
  let html: string;
  try {
    html = await readFile(join(process.cwd(), 'dist', 'index.html'), 'utf8');
  } catch {
    html = await (await fetch(`${origin}/index.html`)).text();
  }
  shell = html;
  return html;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

interface Meta {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  article?: { published: string; modified?: string | null };
  noindex?: boolean;
  jsonLd?: unknown;
}

function render(html: string, m: Meta): string {
  // Drop the shell's default tags, then add this page's.
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<(meta|link)\b[^>]*>/gi, (tag) =>
      /name="(description|robots|twitter:[^"]*)"|property="og:[^"]*"|rel="canonical"/i.test(tag) ? '' : tag,
    );
  const url = SITE_URL + m.path;
  const img = m.image || OG_DEFAULT;
  const t = esc(m.title);
  const d = esc(m.description);
  const tags = [`<title>${t}</title>`, `<meta name="robots" content="${m.noindex ? 'noindex,follow' : 'index,follow'}">`];
  if (!m.noindex) {
    tags.push(
      `<meta name="description" content="${d}">`,
      `<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:type" content="${m.article ? 'article' : 'website'}">`,
      `<meta property="og:site_name" content="Nenisys">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:title" content="${t}">`,
      `<meta property="og:description" content="${d}">`,
      `<meta property="og:image" content="${esc(img)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${t}">`,
      `<meta name="twitter:description" content="${d}">`,
      `<meta name="twitter:image" content="${esc(img)}">`,
    );
    if (m.article) {
      tags.push(`<meta property="article:published_time" content="${esc(m.article.published)}">`);
      if (m.article.modified) tags.push(`<meta property="article:modified_time" content="${esc(m.article.modified)}">`);
    }
    if (m.jsonLd) tags.push(`<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>`);
  }
  return stripped.replace('</head>', `${tags.join('\n')}\n</head>`);
}

const page = (body: string, status: number, cache: string) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache } });

async function api(path: string): Promise<Response | null> {
  try {
    return await fetch(API_URL + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  } catch {
    return null;
  }
}

async function sitemap(): Promise<Response> {
  const res = await api('/blog/slugs');
  const data = res?.ok ? ((await res.json()) as { posts?: Array<{ slug: string; updatedAt?: string }> }) : null;
  if (!data?.posts) return new Response('Sitemap unavailable', { status: 502 });
  const rows = data.posts
    .filter((p) => SLUG.test(p.slug))
    .map((p) => `<url><loc>${SITE_URL}/blog/${p.slug}</loc>${p.updatedAt ? `<lastmod>${esc(p.updatedAt)}</lastmod>` : ''}</url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/blog</loc></url>${rows.join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has('sitemap')) return sitemap();

  const html = await getShell(url.origin);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return page(
      render(html, { title: 'Blog — Nenisys', description: 'Product news and behind-the-scenes notes from the team building Mercora Edge and Edutech AI.', path: '/blog' }),
      200,
      CACHE,
    );
  }

  const notFound = () => page(render(html, { title: 'Page not found — Nenisys', description: '', path: '/blog', noindex: true }), 404, 'public, s-maxage=30');
  if (!SLUG.test(slug) || slug.length > 120) return notFound();

  const res = await api(`/blog/posts/${slug}`);
  if (!res) return page(html, 503, 'no-store'); // API unreachable: serve the plain shell, the app shows its own error
  if (res.status === 404) return notFound();
  if (!res.ok) return page(html, 502, 'no-store');

  const post = ((await res.json()) as { post?: Record<string, unknown> }).post as
    | { title: string; excerpt: string; seoTitle: string | null; seoDescription: string | null; coverImageUrl: string | null; publishedAt: string; updatedAt: string | null }
    | undefined;
  if (!post?.title) return notFound();

  const title = `${post.seoTitle || post.title} — Nenisys`;
  const description = clip(post.seoDescription || post.excerpt || post.title, 200);
  const path = `/blog/${slug}`;
  return page(
    render(html, {
      title,
      description,
      path,
      image: post.coverImageUrl,
      article: { published: post.publishedAt, modified: post.updatedAt },
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description,
        image: [post.coverImageUrl || OG_DEFAULT],
        datePublished: post.publishedAt,
        dateModified: post.updatedAt || post.publishedAt,
        mainEntityOfPage: { '@type': 'WebPage', '@id': SITE_URL + path },
        author: { '@type': 'Organization', name: 'Nenisys', url: SITE_URL },
        publisher: { '@type': 'Organization', name: 'Nenisys', logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png` } },
      },
    }),
    200,
    CACHE,
  );
}

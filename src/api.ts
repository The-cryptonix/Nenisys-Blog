import { z } from 'zod';
import { API_URL, isHttpsUrl, isSafeHref } from './lib';

/* ---- block schema: mirrors nenisys-backend-survey/src/blog/content.ts. Invalid blocks are skipped, never thrown. ---- */
const href = z.string().refine(isSafeHref);
const https = z.string().refine(isHttpsUrl);
const cap = z.string().max(300).nullish();

const mark = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('underline') }),
  z.object({ type: z.literal('code') }),
  z.object({ type: z.literal('link'), attrs: z.object({ href }) }),
]);
const inline = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string(), marks: z.array(mark).optional() }),
  z.object({ type: z.literal('hardBreak') }),
]);
export type Inline = z.infer<typeof inline>;

const para = z.object({ type: z.literal('paragraph'), content: z.array(inline).optional() });
export interface Li { type: 'listItem'; content: Array<z.infer<typeof para> | List> }
export interface List { type: 'bulletList' | 'orderedList'; content: Li[] }
const li: z.ZodType<Li> = z.lazy(() => z.object({ type: z.literal('listItem'), content: z.array(z.union([para, list])) }));
const list: z.ZodType<List> = z.lazy(() => z.object({ type: z.enum(['bulletList', 'orderedList']), content: z.array(li) }));

const block = z.union([
  para,
  z.object({ type: z.literal('heading'), attrs: z.object({ level: z.number().int().min(2).max(4) }), content: z.array(inline).optional() }),
  list,
  z.object({ type: z.literal('blockquote'), content: z.array(para) }),
  z.object({ type: z.literal('codeBlock'), attrs: z.object({ language: z.string().nullish() }).optional(), content: z.array(z.object({ type: z.literal('text'), text: z.string() })).optional() }),
  z.object({ type: z.literal('horizontalRule') }),
  z.object({
    type: z.literal('image'),
    attrs: z.object({ src: https, alt: z.string().default(''), caption: cap, layout: z.enum(['normal', 'wide', 'full']).default('normal'), width: z.number().nullish(), height: z.number().nullish() }),
  }),
  z.object({
    type: z.literal('video'),
    attrs: z.discriminatedUnion('provider', [
      z.object({ provider: z.literal('youtube'), id: z.string().regex(/^[A-Za-z0-9_-]{11}$/), caption: cap }),
      z.object({ provider: z.literal('vimeo'), id: z.string().regex(/^\d{6,12}$/), caption: cap }),
      z.object({ provider: z.literal('upload'), src: https, poster: https.nullish(), caption: cap }),
    ]),
  }),
  z.object({
    type: z.literal('button'),
    attrs: z.object({ label: z.string().trim().min(1).max(60), href, variant: z.enum(['primary', 'secondary']).default('primary'), align: z.enum(['left', 'center']).default('left') }),
  }),
]);
export type Block = z.infer<typeof block>;
export const parseBlocks = (raw: unknown[]): Block[] =>
  raw.flatMap((n) => {
    const r = block.safeParse(n);
    return r.success ? [r.data] : [];
  });

/* ---- API shapes ---- */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const base = {
  slug: z.string().regex(SLUG).max(120),
  title: z.string(),
  excerpt: z.string(),
  coverImageUrl: https.nullable().catch(null),
  coverAlt: z.string().nullable().catch(null),
  publishedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  readingMinutes: z.number().min(1).catch(1),
};
const summary = z.object(base);
export type PostSummary = z.infer<typeof summary>;
const detail = z.object({
  ...base,
  seoTitle: z.string().nullable().catch(null),
  seoDescription: z.string().nullable().catch(null),
  updatedAt: z.string().nullable().catch(null),
  content: z.object({ content: z.array(z.unknown()) }),
});
export type Post = Omit<z.infer<typeof detail>, 'content'> & { blocks: Block[] };

/* ---- client ---- */
export class ApiError extends Error {
  constructor(public status: number) {
    super(`api_${status}`);
  }
}
export const toApiError = (e: unknown): ApiError => (e instanceof ApiError ? e : new ApiError(0));

async function get(path: string, signal?: AbortSignal): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  const relay = () => ctl.abort();
  signal?.addEventListener('abort', relay);
  try {
    const res = await fetch(API_URL + path, { headers: { Accept: 'application/json' }, credentials: 'omit', signal: ctl.signal });
    if (!res.ok) throw new ApiError(res.status);
    return await res.json();
  } catch (e) {
    throw toApiError(e);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

// Tiny in-memory cache so going back to the list (or to a post you just read) is instant.
const posts = new Map<string, Post>();
let listCache: { posts: PostSummary[]; next: string | null; at: number } | null = null;
export const peekPost = (slug: string) => posts.get(slug);
export const peekList = () => listCache;
export const rememberList = (p: PostSummary[], next: string | null) => {
  listCache = { posts: p, next, at: Date.now() };
};

export async function fetchPosts(limit: number, cursor: string | null, signal?: AbortSignal) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set('cursor', cursor);
  const d = z.object({ posts: z.array(z.unknown()), nextCursor: z.string().nullable().catch(null) }).safeParse(await get(`/blog/posts?${q}`, signal));
  if (!d.success) throw new ApiError(502);
  return {
    posts: d.data.posts.flatMap((p) => {
      const r = summary.safeParse(p);
      return r.success ? [r.data] : [];
    }),
    next: d.data.nextCursor,
  };
}

export async function fetchPost(slug: string, signal?: AbortSignal): Promise<Post> {
  if (!SLUG.test(slug) || slug.length > 120) throw new ApiError(404);
  const d = z.object({ post: detail }).safeParse(await get(`/blog/posts/${slug}`, signal));
  if (!d.success) throw new ApiError(502);
  const { content, ...rest } = d.data.post;
  const post: Post = { ...rest, blocks: parseBlocks(content.content) };
  posts.set(slug, post);
  return post;
}

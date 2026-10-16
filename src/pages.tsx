import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ApiError, fetchPost, fetchPosts, peekList, peekPost, rememberList, toApiError, type Post, type PostSummary } from './api';
import { BlockRenderer } from './blocks';
import { BrandMark, CardSkeleton, Cover, ErrorBox, FeaturedCard, Meta, PostCard, Seo, useReveal } from './components';
import { PAGE_SIZE, SITE_URL } from './lib';

function ClosingCard() {
  const [ref, seen] = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`cta reveal${seen ? ' in' : ''}`} aria-labelledby='cta-t'>
      <div className='eyebrow'>Newsletter</div>
      <h2 id='cta-t'>Never miss a post.</h2>
      <p>Get launch updates and new articles by email. No spam.</p>
      <a className='btn p' href='/#edge'>Subscribe</a>
    </section>
  );
}

/* ---------------- /blog ---------------- */
type ListState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; posts: PostSummary[]; next: string | null };

export function BlogIndex() {
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [note, setNote] = useState('');
  const focusSlug = useRef<string | null>(null);
  const [state, setState] = useState<ListState>(() => {
    const c = peekList();
    return c ? { phase: 'ready', posts: c.posts, next: c.next } : { phase: 'loading' };
  });

  useEffect(() => {
    const cached = peekList();
    if (attempt === 0 && cached && Date.now() - cached.at < 60_000) return;
    if (attempt > 0) setState({ phase: 'loading' });
    const ctl = new AbortController();
    fetchPosts(PAGE_SIZE, null, ctl.signal).then(
      (page) => {
        if (ctl.signal.aborted) return;
        const c = peekList();
        if (c && c.posts.length > PAGE_SIZE) return rememberList(c.posts, c.next); // reader already paged: keep their list
        rememberList(page.posts, page.next);
        setState({ phase: 'ready', posts: page.posts, next: page.next });
      },
      () => !ctl.signal.aborted && setState((s) => (s.phase === 'ready' ? s : { phase: 'error' })),
    );
    return () => ctl.abort();
  }, [attempt]);

  // After "Load more", move focus to the first new post so keyboard and screen-reader users land in the right place.
  useEffect(() => {
    if (!focusSlug.current) return;
    document.querySelector<HTMLAnchorElement>(`[data-slug="${CSS.escape(focusSlug.current)}"] a`)?.focus();
    focusSlug.current = null;
  }, [state]);

  const loadMore = useCallback(async () => {
    if (state.phase !== 'ready' || !state.next || more === 'loading') return;
    setMore('loading');
    try {
      const page = await fetchPosts(PAGE_SIZE, state.next);
      const fresh = page.posts.filter((p) => !state.posts.some((x) => x.slug === p.slug));
      const posts = [...state.posts, ...fresh];
      rememberList(posts, page.next);
      focusSlug.current = fresh[0]?.slug ?? null;
      setState({ phase: 'ready', posts, next: page.next });
      setNote(`${fresh.length} more ${fresh.length === 1 ? 'post' : 'posts'} loaded.`);
      setMore('idle');
    } catch {
      setMore('error');
    }
  }, [state, more]);

  const [first, ...rest] = state.phase === 'ready' ? state.posts : [];

  return (
    <>
      <Seo title='Blog — Nenisys' description='Product news and behind-the-scenes notes from the team building Mercora Edge and Edutech AI.' path='/blog' />
      <section className='page-hero'>
        <div className='wrap'>
          <span className='tag'><i />Blog</span>
          <h1>Ideas, <span>updates</span> and lessons from Nenisys.</h1>
          <p className='lead'>Product news and behind-the-scenes notes from the team building Mercora Edge and Edutech AI.</p>
        </div>
      </section>

      <section className='list-sec'>
        <div className='wrap'>
          {state.phase === 'loading' && (
            <div role='status' aria-label='Loading posts' aria-busy='true'>
              <div className='fcard skel'><div className='sk sk-feat' /><div className='fcard-body'><div className='sk sk-line short' /><div className='sk sk-line' /><div className='sk sk-line mid' /></div></div>
              <div className='pgrid'><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
            </div>
          )}
          {state.phase === 'error' && <ErrorBox title='Posts could not be loaded' message='Check your connection and try again.' onRetry={() => setAttempt((n) => n + 1)} />}
          {state.phase === 'ready' && !first && (
            <div className='statebox'>
              <BrandMark className='state-mark' />
              <h2>No posts yet</h2>
              <p>The first article is on its way. Subscribe and we will email you when it lands.</p>
              <div className='state-actions'><a className='btn p' href='/#edge'>Subscribe</a></div>
            </div>
          )}
          {first && (
            <>
              <FeaturedCard post={first} />
              {rest.length > 0 && (
                <>
                  <h2 className='sec-t'>More articles</h2>
                  <div className='pgrid'>{rest.map((p, i) => <PostCard key={p.slug} post={p} index={i} />)}</div>
                </>
              )}
              {state.phase === 'ready' && state.next && (
                <div className='more'>
                  <button className='btn s' type='button' onClick={loadMore} disabled={more === 'loading'}>
                    {more === 'loading' ? <><BrandMark mode='loop' className='spin' />Loading</> : 'Load more'}
                  </button>
                  {more === 'error' && <p className='fmsg' role='alert'>Could not load more posts. Please try again.</p>}
                </div>
              )}
              <p className='sr' role='status'>{note}</p>
            </>
          )}
        </div>
      </section>

      <section className='band'><div className='wrap'><ClosingCard /></div></section>
    </>
  );
}

/* ---------------- /blog/:slug ---------------- */
export function NotFound() {
  return (
    <>
      <Seo title='Page not found — Nenisys' description='This page does not exist.' path='/blog' noindex />
      <section className='page-hero'>
        <div className='wrap'>
          <span className='tag'><i />404</span>
          <h1>That page <span>does not exist</span>.</h1>
          <p className='lead'>The post may have moved, or it has not gone live yet.</p>
          <div className='btns'><Link className='btn p' href='/'>Back to the blog</Link></div>
        </div>
      </section>
    </>
  );
}

function PostSkeleton() {
  return (
    <div className='post' role='status' aria-label='Loading post' aria-busy='true'>
      <div className='wrap'>
        <div className='article-grid'>
          <div className='sk sk-line short' />
          <div className='sk sk-title' />
          <div className='sk sk-title mid' />
          <div className='post-cover layout-wide'><div className='sk sk-feat' /></div>
          <div className='sk sk-line' /><div className='sk sk-line' /><div className='sk sk-line mid' />
        </div>
      </div>
    </div>
  );
}

function PostView({ post }: { post: Post }) {
  const description = post.seoDescription || post.excerpt;
  return (
    <>
      <Seo title={`${post.seoTitle || post.title} — Nenisys`} description={description} path={`/blog/${post.slug}`} image={post.coverImageUrl} article={{ published: post.publishedAt, modified: post.updatedAt }} />
      <article className='post'>
        <div className='wrap'>
          <div className='article-grid'>
            <Link className='back' href='/'>
              <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M19 12H5M11 6l-6 6 6 6' /></svg>
              All posts
            </Link>
            <header className='post-head'>
              <Meta post={post} />
              <h1 className='post-title'>{post.title}</h1>
              {post.excerpt && <p className='post-lead'>{post.excerpt}</p>}
            </header>
            {post.coverImageUrl && (
              <div className='post-cover layout-wide'>
                <Cover src={post.coverImageUrl} alt={post.coverAlt ?? ''} ratio='16x9' eager />
              </div>
            )}
            <BlockRenderer blocks={post.blocks} />
            <div className='post-end'>
              <span>Published on {SITE_URL.replace('https://', '')}/blog</span>
              <Link className='btn s sm' href='/'>More articles</Link>
            </div>
          </div>
        </div>
      </article>
      <section className='band'><div className='wrap'><ClosingCard /></div></section>
    </>
  );
}

export function PostPage({ slug }: { slug: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ s: 'loading' } | { s: 'ok'; post: Post } | { s: 'error'; err: ApiError }>(() => {
    const c = peekPost(slug);
    return c ? { s: 'ok', post: c } : { s: 'loading' };
  });

  useEffect(() => {
    const ctl = new AbortController();
    if (attempt > 0) setState({ s: 'loading' });
    fetchPost(slug, ctl.signal).then(
      (post) => !ctl.signal.aborted && setState({ s: 'ok', post }),
      (e) => !ctl.signal.aborted && setState((cur) => (cur.s === 'ok' ? cur : { s: 'error', err: toApiError(e) })),
    );
    return () => ctl.abort();
  }, [slug, attempt]);

  if (state.s === 'loading') return <PostSkeleton />;
  if (state.s === 'error') {
    return state.err.status === 404 ? (
      <NotFound />
    ) : (
      <section className='page-hero'><div className='wrap'><ErrorBox title='This post could not be loaded' message='Check your connection and try again.' onRetry={() => setAttempt((n) => n + 1)} /></div></section>
    );
  }
  return <PostView post={state.post} />;
}

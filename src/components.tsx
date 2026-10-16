import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { OG_DEFAULT, SITE_URL, formatDate } from './lib';
import type { PostSummary } from './api';

/* ---- brand: the N mark from the Nenisys site (dot + two strokes). draw = plays once, loop = spinner ---- */
export function BrandMark({ mode, className }: { mode?: 'draw' | 'loop'; className?: string }) {
  return (
    <svg className={`bm${mode ? ` bm-${mode}` : ''}${className ? ` ${className}` : ''}`} viewBox='18 15 64 70' aria-hidden='true' focusable='false'>
      <circle className='bm-dot' cx='26' cy='23' r='8' fill='currentColor' />
      <path className='bm-s1' pathLength={1} d='M26 77V44' fill='none' stroke='currentColor' strokeWidth={16} strokeLinecap='round' strokeLinejoin='round' />
      <path className='bm-s2' pathLength={1} d='M74 23V77L51 50' fill='none' stroke='currentColor' strokeWidth={16} strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

/* ---- header / footer: same pill nav and links as nenisys.shop ---- */
const NAV = [
  { label: 'About', href: '/#about' },
  { label: 'Mercora Edge', href: '/#edge' },
  { label: 'Edutech AI', href: '/#how' },
  { label: 'Survey', href: 'https://survey.nenisys.shop' },
];

export function SiteHeader() {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 20);
    f();
    addEventListener('scroll', f, { passive: true });
    return () => removeEventListener('scroll', f);
  }, []);
  useEffect(() => setOpen(false), [loc]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        burger.current?.focus();
      }
    };
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const resize = () => innerWidth > 760 && setOpen(false);
    addEventListener('keydown', key);
    addEventListener('click', outside);
    addEventListener('resize', resize);
    return () => {
      removeEventListener('keydown', key);
      removeEventListener('click', outside);
      removeEventListener('resize', resize);
    };
  }, [open]);

  return (
    <header ref={root} className={scrolled ? 'scrolled' : ''}>
      <div className='wrap'>
        <div className='nav'>
          <a className='brand' href='/' aria-label='Nenisys home'>
            <BrandMark mode='draw' />
          </a>
          <div className={`links${open ? ' open' : ''}`} id='menu'>
            {NAV.slice(0, 3).map((l) => (
              <a key={l.href} className='l' href={l.href}>{l.label}</a>
            ))}
            <Link className='l active' href='/' aria-current={loc === '/' ? 'page' : undefined}>Blog</Link>
            <a className='l' href={NAV[3]!.href}>{NAV[3]!.label}</a>
            <a className='btn p sm' href='/#contact'>Contact</a>
          </div>
          <button ref={burger} className='burger' type='button' aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls='menu' onClick={() => setOpen((o) => !o)}>
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className='wrap'>
        <span>&copy; {new Date().getFullYear()} Nenisys. All rights reserved.</span>
        <span className='flinks'>
          <a href='/'>Home</a>
          <a href='https://survey.nenisys.shop'>Survey</a>
          <a href='https://www.tiktok.com/@nenisys.com' target='_blank' rel='noopener noreferrer'>TikTok</a>
          <a href='https://x.com/NENISYS' target='_blank' rel='noopener noreferrer'>X</a>
          <a href='/#privacy'>Privacy</a>
          <a href='/#terms'>Terms</a>
          <a href='/#risk'>Risk Disclosure</a>
        </span>
      </div>
    </footer>
  );
}

/* ---- head tags (title, description, canonical, Open Graph, Twitter). Restored when the page unmounts. ---- */
interface SeoProps {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  article?: { published: string; modified?: string | null };
  noindex?: boolean;
}
export function Seo(p: SeoProps) {
  const key = JSON.stringify(p);
  useEffect(() => {
    const undo: Array<() => void> = [];
    const prevTitle = document.title;
    const set = (attr: string, k: string, v: string) => {
      const tag = attr === 'rel' ? 'link' : 'meta';
      const field = attr === 'rel' ? 'href' : 'content';
      const found = document.head.querySelector<HTMLElement>(`${tag}[${attr}="${k}"]`);
      if (found) {
        const old = found.getAttribute(field);
        found.setAttribute(field, v);
        undo.push(() => (old === null ? found.removeAttribute(field) : found.setAttribute(field, old)));
      } else {
        const el = document.createElement(tag);
        el.setAttribute(attr, k);
        el.setAttribute(field, v);
        document.head.append(el);
        undo.push(() => el.remove());
      }
    };
    document.title = p.title;
    set('name', 'robots', p.noindex ? 'noindex,follow' : 'index,follow');
    if (!p.noindex) {
      const url = SITE_URL + p.path;
      const img = p.image || OG_DEFAULT;
      set('rel', 'canonical', url);
      set('name', 'description', p.description);
      const tags: Array<[string, string, string]> = [
        ['property', 'og:type', p.article ? 'article' : 'website'],
        ['property', 'og:url', url],
        ['property', 'og:title', p.title],
        ['property', 'og:description', p.description],
        ['property', 'og:image', img],
        ['name', 'twitter:card', 'summary_large_image'],
        ['name', 'twitter:title', p.title],
        ['name', 'twitter:description', p.description],
        ['name', 'twitter:image', img],
      ];
      tags.forEach(([a, k, v]) => set(a, k, v));
      if (p.article) {
        set('property', 'article:published_time', p.article.published);
        if (p.article.modified) set('property', 'article:modified_time', p.article.modified);
      }
    }
    return () => {
      document.title = prevTitle;
      undo.reverse().forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/* ---- scroll-reveal (the site's .reveal pattern) ---- */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && (setSeen(true), io.disconnect()),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/* ---- cards ---- */
export function Cover({ src, alt, ratio, eager }: { src: string | null; alt: string; ratio: '16x10' | '16x9'; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [w, h] = ratio === '16x9' ? [1280, 720] : [1600, 1000];
  return (
    <div className={`cover r${ratio}`}>
      {src && !failed ? (
        <img src={src} alt={alt} width={w} height={h} loading={eager ? 'eager' : 'lazy'} decoding='async' onError={() => setFailed(true)} />
      ) : (
        <div className='cover-fb' aria-hidden='true'>
          <BrandMark className='cover-mark' />
        </div>
      )}
    </div>
  );
}

export function Meta({ post }: { post: Pick<PostSummary, 'publishedAt' | 'readingMinutes'> }) {
  return (
    <div className='meta'>
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
      <span className='sep' aria-hidden='true'>·</span>
      <span>{post.readingMinutes} min read</span>
    </div>
  );
}

export function PostCard({ post, index = 0 }: { post: PostSummary; index?: number }) {
  const [ref, seen] = useReveal<HTMLElement>();
  return (
    <article ref={ref} data-slug={post.slug} className={`pcard reveal d${index % 3}${seen ? ' in' : ''}`}>
      <Cover src={post.coverImageUrl} alt='' ratio='16x10' />
      <div className='pcard-body'>
        <Meta post={post} />
        <h3 className='pcard-title'><Link className='stretch' href={`/${post.slug}`}>{post.title}</Link></h3>
        {post.excerpt && <p className='pcard-ex'>{post.excerpt}</p>}
      </div>
    </article>
  );
}

export function FeaturedCard({ post }: { post: PostSummary }) {
  const [ref, seen] = useReveal<HTMLElement>();
  return (
    <article ref={ref} data-slug={post.slug} className={`fcard reveal${seen ? ' in' : ''}`}>
      <span className='badge'>Latest</span>
      <Cover src={post.coverImageUrl} alt='' ratio='16x10' eager />
      <div className='fcard-body'>
        <Meta post={post} />
        <h2 className='fcard-title'><Link className='stretch' href={`/${post.slug}`}>{post.title}</Link></h2>
        {post.excerpt && <p className='fcard-ex'>{post.excerpt}</p>}
        <span className='btn p' aria-hidden='true'>Read article</span>
      </div>
    </article>
  );
}

/* ---- loading and error states ---- */
export function CardSkeleton() {
  return (
    <div className='pcard' aria-hidden='true'>
      <div className='sk sk-cover' />
      <div className='pcard-body'>
        <div className='sk sk-line short' />
        <div className='sk sk-line' />
        <div className='sk sk-line mid' />
      </div>
    </div>
  );
}

export function ErrorBox({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className='statebox' role='alert'>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className='state-actions'>
        <button className='btn p' type='button' onClick={onRetry}>Try again</button>
        <Link className='btn s' href='/'>All posts</Link>
      </div>
    </div>
  );
}

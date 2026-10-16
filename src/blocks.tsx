import { useMemo, useState, type ReactNode } from 'react';
import { isSafeHref } from './lib';
import type { Block, Inline, List } from './api';

type TextNode = Extract<Inline, { type: 'text' }>;

/* Builds React elements only. Nothing is injected as HTML, and links are re-checked here. */
function TextRun({ node }: { node: TextNode }) {
  let out: ReactNode = node.text;
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') out = <strong>{out}</strong>;
    else if (m.type === 'italic') out = <em>{out}</em>;
    else if (m.type === 'underline') out = <u>{out}</u>;
    else if (m.type === 'code') out = <code className='b-code'>{out}</code>;
    else if (m.type === 'link' && isSafeHref(m.attrs.href)) {
      out = <a href={m.attrs.href} rel={/^https?:/i.test(m.attrs.href) ? 'noopener noreferrer' : undefined}>{out}</a>;
    }
  }
  return <>{out}</>;
}

function Inlines({ nodes }: { nodes?: Inline[] }) {
  return <>{(nodes ?? []).map((n, i) => (n.type === 'hardBreak' ? <br key={i} /> : <TextRun key={i} node={n} />))}</>;
}

const hasText = (nodes?: Inline[]) => (nodes ?? []).some((n) => n.type === 'text' && n.text.trim());

function ListView({ list }: { list: List }) {
  const Tag = list.type === 'orderedList' ? 'ol' : 'ul';
  return (
    <Tag className='b-list'>
      {list.content.map((item, i) => (
        <li key={i}>
          {item.content.map((c, j) => (c.type === 'paragraph' ? <p key={j} className='li-p'><Inlines nodes={c.content} /></p> : <ListView key={j} list={c} />))}
        </li>
      ))}
    </Tag>
  );
}

function Code({ text, lang }: { text: string; lang: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };
  return (
    <div className='b-codewrap'>
      <div className='b-codebar'>
        <span>{lang || 'code'}</span>
        <button type='button' className='b-copy' onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre tabIndex={0}><code>{text}</code></pre>
      <span className='sr' role='status'>{copied ? 'Copied to clipboard' : ''}</span>
    </div>
  );
}

type ImageAttrs = Extract<Block, { type: 'image' }>['attrs'];
function ImageBlock({ a }: { a: ImageAttrs }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={`b-fig layout-${a.layout}`}>
      {failed ? (
        <div className='b-imgfail' role='img' aria-label={a.alt || 'Image unavailable'}>Image unavailable</div>
      ) : (
        <img className='b-img' src={a.src} alt={a.alt} width={a.width ?? undefined} height={a.height ?? undefined} loading='lazy' decoding='async' onError={() => setFailed(true)} />
      )}
      {a.caption && <figcaption>{a.caption}</figcaption>}
    </figure>
  );
}

/* Embeds load only after a click, so no third party is contacted just by opening a post. */
type VideoAttrs = Extract<Block, { type: 'video' }>['attrs'];
function VideoBlock({ a }: { a: VideoAttrs }) {
  const [on, setOn] = useState(false);
  let body: ReactNode;
  if (a.provider === 'upload') {
    body = <video className='b-media' controls preload='metadata' playsInline poster={a.poster ?? undefined} src={a.src} />;
  } else {
    const name = a.provider === 'youtube' ? 'YouTube' : 'Vimeo';
    const src = a.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${a.id}?autoplay=1&rel=0` : `https://player.vimeo.com/video/${a.id}?autoplay=1&dnt=1`;
    body = on ? (
      <iframe className='b-media' src={src} title={a.caption || `${name} video`} allow='autoplay; encrypted-media; picture-in-picture; fullscreen' allowFullScreen referrerPolicy='strict-origin-when-cross-origin' />
    ) : (
      <button type='button' className='b-facade' onClick={() => setOn(true)}>
        <span className='b-play' aria-hidden='true'><svg viewBox='0 0 24 24'><path d='M8 5v14l11-7z' /></svg></span>
        <span className='b-facade-t'>Play video</span>
        <span className='b-facade-s'>Loads from {name} when you press play</span>
      </button>
    );
  }
  return (
    <figure className='b-fig layout-wide'>
      <div className='b-frame'>{body}</div>
      {a.caption && <figcaption>{a.caption}</figcaption>}
    </figure>
  );
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function headingIds(blocks: Block[]) {
  const seen = new Map<string, number>();
  const ids = new Map<number, string>();
  blocks.forEach((b, i) => {
    if (b.type !== 'heading') return;
    const base = slugify((b.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('')) || 'section';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    ids.set(i, n ? `${base}-${n + 1}` : base);
  });
  return ids;
}

function BlockView({ b, id }: { b: Block; id?: string }) {
  switch (b.type) {
    case 'paragraph':
      return hasText(b.content) ? <p className='b-p'><Inlines nodes={b.content} /></p> : null;
    case 'heading': {
      const Tag = `h${b.attrs.level}` as 'h2' | 'h3' | 'h4';
      return (
        <Tag className='b-h' id={id}>
          <Inlines nodes={b.content} />
          {id && <a className='h-anchor' href={`#${id}`} aria-label='Link to this section'>#</a>}
        </Tag>
      );
    }
    case 'bulletList':
    case 'orderedList':
      return <ListView list={b} />;
    case 'blockquote':
      return <blockquote className='b-quote'>{b.content.map((p, i) => <p key={i}><Inlines nodes={p.content} /></p>)}</blockquote>;
    case 'codeBlock':
      return <Code text={(b.content ?? []).map((c) => c.text).join('')} lang={b.attrs?.language ?? null} />;
    case 'horizontalRule':
      return <hr className='b-hr' />;
    case 'image':
      return <ImageBlock a={b.attrs} />;
    case 'video':
      return <VideoBlock a={b.attrs} />;
    case 'button': {
      if (!isSafeHref(b.attrs.href)) return null;
      const ext = /^https?:/i.test(b.attrs.href);
      return (
        <div className={`b-btn align-${b.attrs.align}`}>
          <a className={`btn ${b.attrs.variant === 'secondary' ? 's' : 'p'}`} href={b.attrs.href} rel={ext ? 'noopener noreferrer' : undefined}>{b.attrs.label}</a>
        </div>
      );
    }
    default:
      return null;
  }
}

/** Renders as a fragment so every block is a direct child of the article grid (wide and full layouts rely on that). */
export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  const ids = useMemo(() => headingIds(blocks), [blocks]);
  return <>{blocks.map((b, i) => <BlockView key={i} b={b} id={ids.get(i)} />)}</>;
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { API_URL } from './lib';

/* Newsletter signup as a modal (same flow and look as the Subscribe modal on nenisys.shop).
   Posts to the backend's double opt-in endpoint: the confirmation link is sent by email. */
type SubResult = 'ok' | 'invalid' | 'limited' | 'unavailable';

async function subscribe(email: string): Promise<SubResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(`${API_URL}/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, consent: true, source: 'site' }),
      credentials: 'omit',
      signal: ctl.signal,
    });
    if (res.status === 202) return 'ok';
    if (res.status === 429) return 'limited';
    if (res.status === 400) return 'invalid';
    return 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

const SUB_ERRORS: Record<Exclude<SubResult, 'ok'>, string> = {
  invalid: 'Please check your email address and try again.',
  limited: 'Too many tries. Please wait a while and try again.',
  unavailable: 'Signup is temporarily unavailable. Please try again later.',
};

function SubscribeModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  const [burst, setBurst] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  // Scroll lock, Escape to close, focus trap.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('modal-open');
    const t = setTimeout(() => emailRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !cardRef.current) return;
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button,input,a[href]')).filter(
        (x) => !(x as HTMLButtonElement).disabled && x.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      root.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (phase === 'done') doneRef.current?.focus();
  }, [phase]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (phase === 'busy') return;
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 320) {
      setError('Please enter a valid email address.');
      return emailRef.current?.focus();
    }
    if (!consent) return setError('Please tick the box to agree to receive emails.');
    setError('');
    setPhase('busy');
    const result = await subscribe(v);
    if (result === 'ok') {
      setPhase('done');
    } else {
      setError(SUB_ERRORS[result]);
      setPhase('idle');
    }
  };

  return (
    <div className='modal'>
      <div className='modal-bg' onClick={onClose} />
      <div className='modal-card' role='dialog' aria-modal='true' aria-labelledby='sub-title' ref={cardRef}>
        <button className='modal-x' type='button' aria-label='Close' onClick={onClose}>
          <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M5 5l14 14M19 5L5 19' /></svg>
        </button>
        {phase === 'done' ? (
          <div className='sub-done'>
            {/* Remounting (new key) replays the CSS animation: tap the check to see it again. */}
            <button key={burst} className='ok go' type='button' aria-label='Play the success animation again' onClick={() => setBurst((n) => n + 1)}>
              <svg viewBox='0 0 64 64' aria-hidden='true' focusable='false'>
                <circle className='ok-c' cx='32' cy='32' r='28' pathLength={1} />
                <path className='ok-t' pathLength={1} d='M20 33l9 9 16-19' />
              </svg>
              {Array.from({ length: 14 }, (_, i) => <i key={i} className='cf' />)}
            </button>
            <h2 id='sub-title' ref={doneRef} tabIndex={-1}>Check your email.</h2>
            <p className='sub-p'>Check your email to confirm your signup (look in spam too).</p>
            <button className='btn s' type='button' onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div className='eyebrow'>Newsletter</div>
            <h2 id='sub-title'>Never miss a post.</h2>
            <p className='sub-p'>Get launch updates and new articles by email. No spam.</p>
            <form onSubmit={onSubmit} noValidate>
              <label className='sr' htmlFor='sub-email'>Email address</label>
              <input
                ref={emailRef}
                className='field'
                id='sub-email'
                name='email'
                type='email'
                inputMode='email'
                autoComplete='email'
                placeholder='you@example.com'
                maxLength={320}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label className='consent'>
                <input type='checkbox' checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  I agree to receive the Nenisys newsletter by email and can unsubscribe at any time. See the{' '}
                  <a href='https://nenisys.shop/#privacy' target='_blank' rel='noopener noreferrer'>Privacy Policy</a>.
                </span>
              </label>
              <div className='fmsg' role='alert'>{error}</div>
              <button className='btn p' type='submit' disabled={phase === 'busy'}>{phase === 'busy' ? 'Subscribing…' : 'Subscribe'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** A button that opens the signup modal. The modal is portalled to <body> so scroll-reveal transforms cannot trap it. */
export function SubscribeButton({ className = 'btn p', label = 'Subscribe' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    btn.current?.focus();
  }, []);
  return (
    <>
      <button ref={btn} className={className} type='button' aria-haspopup='dialog' onClick={() => setOpen(true)}>{label}</button>
      {open && createPortal(<SubscribeModal onClose={close} />, document.body)}
    </>
  );
}

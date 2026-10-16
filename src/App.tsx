import { useEffect, useRef } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { SiteFooter, SiteHeader } from './components';
import { BlogIndex, NotFound, PostPage } from './pages';

/** New page: scroll to top and move focus to <main>. Back/forward: leave the browser's own scroll restoration alone. */
function ScrollManager() {
  const [loc] = useLocation();
  const first = useRef(true);
  const popped = useRef(false);
  useEffect(() => {
    const f = () => (popped.current = true);
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (popped.current) return void (popped.current = false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [loc]);
  return null;
}

export function App() {
  return (
    <Router base='/blog'>
      <a className='skip' href='#main'>Skip to content</a>
      <ScrollManager />
      <SiteHeader />
      <main id='main' tabIndex={-1}>
        <Switch>
          <Route path='/' component={BlogIndex} />
          <Route path='/:slug'>{(p) => <PostPage key={p.slug} slug={p.slug} />}</Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <SiteFooter />
    </Router>
  );
}

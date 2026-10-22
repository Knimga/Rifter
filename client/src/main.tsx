import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Dev-only forge builder page at /dev/forge. `import.meta.env.DEV` is a build-time constant, so in
// production this branch (and the lazily imported page with its drafts) is removed entirely.
const ForgePage = import.meta.env.DEV ? lazy(() => import('./forge/dev/ForgePage')) : null;
const isForgeRoute = import.meta.env.DEV && location.pathname.startsWith('/dev/forge');

// Dev only: React's development build logs every component render to the browser's performance timeline
// (performance.measure, with a copy of the component's props), and the browser keeps every entry until
// they are cleared. Over a long session that grew past 2 GB and made garbage collection freeze the game.
// Clearing them regularly keeps memory flat; a profiler recording still captures each entry as it is made.
if (import.meta.env.DEV) setInterval(() => { performance.clearMeasures(); performance.clearMarks(); }, 5000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isForgeRoute && ForgePage ? (
      <Suspense fallback={null}>
        <ForgePage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);

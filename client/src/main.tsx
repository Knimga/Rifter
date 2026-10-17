import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Dev-only forge builder page at /dev/forge. `import.meta.env.DEV` is a build-time constant, so in
// production this branch (and the lazily imported page with its drafts) is removed entirely.
const ForgePage = import.meta.env.DEV ? lazy(() => import('./forge/dev/ForgePage')) : null;
const isForgeRoute = import.meta.env.DEV && location.pathname.startsWith('/dev/forge');

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

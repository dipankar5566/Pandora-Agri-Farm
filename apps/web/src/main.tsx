import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Latin subset only — this app is English + Bengali (Bengali renders via
// the "Noto Sans Bengali"/"Bangla MN" fallbacks in theme.ts, not Inter,
// which has no Bengali glyphs). The unscoped imports pull every Unicode
// subset (cyrillic, greek, vietnamese, ...), which defeats the point of
// self-hosting for a low-bandwidth rural connection.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './design-tokens.css';
import App from './App';
import './i18n';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

// App-shell service worker: production builds only, so dev hot-reload
// never fights a cache. Scope and limits documented in public/sw.js.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

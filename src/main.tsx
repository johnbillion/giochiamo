import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dev-only: expose headless game sessions on `window` so you can play in the browser
// console: `qg.newGame(2)` for Queen's Garden.
// Stripped from production builds — the DEV branch is statically false there.
if (import.meta.env.DEV) {
  void import('./queens-garden/playground').then((qg) => {
    (window as typeof window & { qg?: typeof qg }).qg = qg;
  });
}

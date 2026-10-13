import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './design/tokens.css';
import './styles.css';
import App from './App';

// iPad: zabránit zoomu gestem (pinch) – viewport má user-scalable=no, Safari ho ale ignoruje.
document.addEventListener('gesturestart', (e) => e.preventDefault());

// iPad PWA se z plochy jen „probudí“ bez načtení → nová verze by se nestáhla. Kontrola při návratu do appky a každou hodinu.
registerSW({
  immediate: true,
  onRegisteredSW(_url, r) {
    if (!r) return;
    const check = () => { if (navigator.onLine) void r.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.setInterval(check, 60 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

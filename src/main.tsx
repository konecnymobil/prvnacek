import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './design/tokens.css';
import './styles.css';
import App from './App';

// iPad: zabránit zoomu gestem (pinch) – viewport má user-scalable=no, Safari ho ale ignoruje.
document.addEventListener('gesturestart', (e) => e.preventDefault());

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

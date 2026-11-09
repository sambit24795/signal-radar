import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './styles.css';
import { App } from './App';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

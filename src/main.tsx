import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Prevent benign Vite HMR/WebSocket and Firestore connection errors from displaying in the app UI
if (typeof window !== 'undefined') {
  const isIgnorableError = (msg: string, reason?: any) => {
    const combined = `${msg} ${reason ? String(reason) : ''} ${reason?.message || ''}`.toLowerCase();
    if (
      combined.includes('websocket') ||
      combined.includes('vite') ||
      combined.includes('failed to connect') ||
      combined.includes('closed without opened') ||
      combined.includes('connection refused') ||
      combined.includes('cloud firestore') ||
      combined.includes('firestore') ||
      combined.includes('could not reach') ||
      combined.includes('unavailable')
    ) {
      return true;
    }
    return false;
  };

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason || '');
    if (isIgnorableError(message, event.reason)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.message || event.error?.message || '';
    if (isIgnorableError(message, event.error)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

// Register the offline emergency-relay service worker (Feature 239). Requires
// a secure context (HTTPS or localhost); failure is non-fatal.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* non-fatal */
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);



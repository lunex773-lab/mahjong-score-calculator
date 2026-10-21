import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { StoreProvider } from './store/game-store';
import './styles.css';
import { installAppHeight } from './ui/app-height';

// 機種ごとの画面の高さに合わせる（iPhone のホーム画面アプリで下に余白が出ないように）
installAppHeight();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// アプリとして使うため、ピンチ操作での画面全体の拡大を止める。
// iPhone の Safari は viewport の user-scalable=no を無視するため、ジェスチャーイベントで止める。
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// オフライン動作のための Service Worker（本番ビルドのみ）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 登録に失敗してもアプリはオンラインで動作する */
    });
  });
}

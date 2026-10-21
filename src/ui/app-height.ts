/**
 * 画面の高さの自動調整。
 *
 * iPhone でホーム画面に追加したアプリとして開くと（ステータスバーを重ねる表示のとき）、
 * 100dvh や window.innerHeight がステータスバーの分だけ短く報告され、画面の下に
 * 同じ高さの余白が残る。この場合は端末の画面の高さそのものをアプリの高さにする。
 * それ以外（Safari のタブ内・Android・PC）は CSS の 100dvh に任せる。
 */
export interface ViewportInfo {
  /** iPhone のホーム画面から起動したか（navigator.standalone） */
  iosStandalone: boolean;
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
}

/** アプリの高さ（px）。調整が不要なら null */
export function fullAppHeight(v: ViewportInfo): number | null {
  if (!v.iosStandalone) return null;
  // iPhone の screen.width / height は縦向きの値で固定のため、向きに合わせて選ぶ
  const landscape = v.innerWidth > v.innerHeight;
  const full = landscape ? Math.min(v.screenWidth, v.screenHeight) : Math.max(v.screenWidth, v.screenHeight);
  // 報告された高さが画面より短いときだけ補う（画面より長くはしない）
  return full > v.innerHeight ? full : null;
}

/** 現在の画面に合わせて --app-h を設定し、回転やサイズ変更にも追従する */
export function installAppHeight(): void {
  const root = document.documentElement;
  const sync = () => {
    const h = fullAppHeight({
      iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    });
    if (h === null) root.style.removeProperty('--app-h');
    else root.style.setProperty('--app-h', `${h}px`);
  };
  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
}

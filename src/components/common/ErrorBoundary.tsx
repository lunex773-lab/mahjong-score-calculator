import { Component, type ReactNode } from 'react';

/** 画面の描画中に想定外のエラーが起きても真っ白にせず、対処方法を表示する */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <h1>表示中に問題が発生しました</h1>
        <p>対局の記録は端末に保存されています。再読み込みすると続きから使えます。</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          再読み込み
        </button>
        <details>
          <summary>開発者向けの情報</summary>
          <pre>{String(this.state.error.message)}</pre>
        </details>
      </div>
    );
  }
}

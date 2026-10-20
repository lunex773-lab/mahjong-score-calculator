import { useState } from 'react';
import { Icon, type IconName } from './components/common/Icon';
import { DragProvider } from './components/tiles/drag';
import { HistoryScreen } from './features/history/HistoryScreen';
import { NewGameScreen } from './features/round/NewGameScreen';
import { TableScreen } from './features/round/TableScreen';
import { SettingsScreen } from './features/rules/SettingsScreen';
import { SettlementScreen } from './features/settlement/SettlementScreen';
import { HelpScreen } from './features/guide/HelpScreen';
import { useStore } from './store/game-store';

type View = 'table' | 'settlement' | 'history' | 'settings' | 'help' | 'new';

const NAV: { view: View; label: string; icon: IconName }[] = [
  { view: 'table', label: '卓', icon: 'table' },
  { view: 'settlement', label: '精算', icon: 'settle' },
  { view: 'history', label: '履歴', icon: 'history' },
  { view: 'settings', label: '設定', icon: 'settings' },
  { view: 'help', label: '使い方', icon: 'help' },
];

export function App() {
  const { game, state, dispatch } = useStore();
  const [view, setView] = useState<View>(game ? 'table' : 'new');
  const [overview, setOverview] = useState(false);
  // 対局が無いときは、卓・精算・履歴の代わりに「新しい対局」を表示する
  const effective: View = !game && view !== 'settings' && view !== 'help' ? 'new' : view;
  /** 下のタブで点灯させる項目（「新しい対局」は「卓」タブとして扱う） */
  const activeTab: View = effective === 'new' ? 'table' : effective;

  return (
    <DragProvider>
      <div className="app">
        <header className="app-header">
          <h1>
            <span className="brand-mark" aria-hidden="true">
              中
            </span>
            麻雀点数計算
          </h1>
          {game && effective === 'table' && (
            <button type="button" className="btn btn-small btn-gold" onClick={() => setOverview(true)}>
              <Icon name="overview" size={16} />
              俯瞰
            </button>
          )}
        </header>

        {state.notices[0] && (
          <div className="banner" role="alert">
            <p>{state.notices[0]}</p>
            <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'dismissNotice' })}>
              閉じる
            </button>
          </div>
        )}

        <main className="app-main">
          {effective === 'table' && (
            <TableScreen overviewOpen={overview} onCloseOverview={() => setOverview(false)} onShowSettlement={() => setView('settlement')} />
          )}
          {effective === 'settlement' && <SettlementScreen />}
          {effective === 'history' && <HistoryScreen onNewGame={() => setView('new')} />}
          {effective === 'settings' && <SettingsScreen />}
          {effective === 'help' && <HelpScreen />}
          {effective === 'new' && <NewGameScreen onStarted={() => setView('table')} onOpenSettings={() => setView('settings')} />}
        </main>

        <nav className="tabbar" aria-label="画面の切り替え">
          {NAV.map((n) => (
            <button
              key={n.view}
              type="button"
              className={activeTab === n.view ? 'on' : ''}
              // 「卓」は対局が無くても押せる（新しい対局の画面を開く）
              disabled={!game && (n.view === 'settlement' || n.view === 'history')}
              onClick={() => setView(n.view)}
              aria-current={activeTab === n.view ? 'page' : undefined}
            >
              <span className="tab-icon">
                <Icon name={n.icon} />
              </span>
              {n.label}
            </button>
          ))}
        </nav>
      </div>
    </DragProvider>
  );
}

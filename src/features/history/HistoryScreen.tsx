import { useState } from 'react';
import { Dialog } from '../../components/common/Dialog';
import { roundLabel } from '../../domain/round/game';
import { useStore } from '../../store/game-store';
import { ScoreBreakdown } from '../scoring/ScoreBreakdown';

const REASON: Record<string, string> = {
  riichi: 'リーチ棒',
  hand: '点数',
  honba: '本場',
  deposit: '供託',
  pao: '包',
  noten: 'ノーテン罰符',
  nagashi: '流し満貫',
  chombo: 'チョンボ',
  leftover: '残り供託',
};

/** 局の履歴（点数移動）と、保存された対局の一覧 */
export function HistoryScreen({ onNewGame }: { onNewGame: () => void }) {
  const { state, game, gameState, dispatch } = useStore();
  const [detail, setDetail] = useState<number | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  if (!game || !gameState) return null;
  const logs = gameState.logs;
  const shown = detail !== null ? logs[detail] : undefined;

  return (
    <div className="screen">
      <h2 className="screen-title">局の履歴</h2>
      {logs.length === 0 && <p className="muted">まだ記録された局はありません。</p>}
      <ol className="history-list">
        {logs.map((l, i) => (
          <li key={i}>
            <button type="button" className="history-item" onClick={() => setDetail(i)}>
              <span className="history-label">{l.label}</span>
              <span className="history-summary">{l.summary}</span>
              <span className="history-points">{l.pointsAfter.map((p) => p.toLocaleString()).join(' / ')}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="button-row">
        <button
          type="button"
          className="btn"
          disabled={game.events.length === 0}
          onClick={() => {
            if (confirm('最後に記録した局を取り消しますか？')) dispatch({ type: 'popEvent' });
          }}
        >
          最後の局を取り消す
        </button>
        <button type="button" className="btn" onClick={() => setFixOpen(true)}>
          局の状態を手動で修正
        </button>
      </div>

      <h2 className="screen-title">保存された対局</h2>
      <ul className="game-list">
        {state.games.map((g) => (
          <li key={g.id} className={g.id === game.id ? 'current' : ''}>
            <div>
              <strong>{g.players.join('・')}</strong>
              <small>
                {new Date(g.createdAt).toLocaleString('ja-JP')}／{g.events.length}件の記録／{g.rules.name}
              </small>
            </div>
            <div className="button-row">
              {g.id !== game.id && (
                <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'selectGame', id: g.id })}>
                  開く
                </button>
              )}
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  if (confirm('この対局を削除しますか？元に戻せません。')) dispatch({ type: 'deleteGame', id: g.id });
                }}
              >
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={onNewGame}>
        新しい対局を始める
      </button>

      {shown && (
        <Dialog title={`${shown.label}`} onClose={() => setDetail(null)}>
          <p className="result-summary">{shown.summary}</p>
          {shown.results.map((r, i) => (
            <ScoreBreakdown key={i} result={r} names={game.players} />
          ))}
          <h3>点棒の移動</h3>
          <ul className="yaku-list">
            {shown.transactions.map((t, i) => (
              <li key={i}>
                <span>
                  {t.from === 'pot' ? '供託' : game.players[t.from]} → {t.to === 'pot' ? '供託' : game.players[t.to]}（{REASON[t.reason]}）
                </span>
                <span>{t.amount.toLocaleString()}点</span>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {fixOpen && <FixDialog onClose={() => setFixOpen(false)} />}
    </div>
  );
}

function FixDialog({ onClose }: { onClose: () => void }) {
  const { game, gameState, dispatch } = useStore();
  const [points, setPoints] = useState(() => gameState!.points.map(String));
  const [roundWind, setRoundWind] = useState(gameState!.roundWind);
  const [kyoku, setKyoku] = useState(gameState!.kyoku);
  const [honba, setHonba] = useState(gameState!.honba);
  const [deposits, setDeposits] = useState(gameState!.deposits);
  if (!game || !gameState) return null;
  const nums = points.map(Number);
  const valid = nums.every((n) => Number.isInteger(n));
  const total = nums.reduce((a, b) => a + b, 0) + deposits * game.rules.settlement.riichiStick;
  const expected = game.rules.game.startingPoints * 4;
  return (
    <Dialog
      title="局の状態を修正"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            dispatch({
              type: 'commitEvent',
              keepDraft: true,
              event: { type: 'state_corrected', points: nums as [number, number, number, number], roundWind, kyoku, honba, deposits },
            });
            onClose();
          }}
        >
          修正を記録
        </button>
      }
    >
      <p className="note">現在: {roundLabel(gameState)}。修正も履歴に記録されます。</p>
      <div className="manual-grid">
        {game.players.map((n, i) => (
          <label key={i} className="field">
            <span>{n}</span>
            <input inputMode="numeric" value={points[i]} onChange={(e) => setPoints((p) => p.map((v, j) => (j === i ? e.target.value : v)))} />
          </label>
        ))}
        <label className="field">
          <span>場風</span>
          <select value={roundWind} onChange={(e) => setRoundWind(Number(e.target.value))}>
            <option value={27}>東場</option>
            {game.rules.game.length === 'hanchan' && <option value={28}>南場</option>}
          </select>
        </label>
        <label className="field">
          <span>局</span>
          <select value={kyoku} onChange={(e) => setKyoku(Number(e.target.value))}>
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k}局
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>本場</span>
          <input type="number" min={0} value={honba} onChange={(e) => setHonba(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="field">
          <span>供託（本）</span>
          <input type="number" min={0} value={deposits} onChange={(e) => setDeposits(Math.max(0, Number(e.target.value)))} />
        </label>
      </div>
      {valid && total !== expected && (
        <p className="warn">⚠ 持ち点＋供託の合計が {total.toLocaleString()}点で、想定（{expected.toLocaleString()}点）と一致しません。</p>
      )}
    </Dialog>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '../../components/common/Dialog';
import { MahjongTable, type SeatInfo } from '../../components/table/MahjongTable';
import { TileView } from '../../components/tiles/Tile';
import { TilePalette } from '../../components/tiles/TilePalette';
import { useDrag } from '../../components/tiles/drag';
import { SEAT_NAMES, seatsOf, seatWindOf, type Seat } from '../../domain/mahjong/hand';
import type { Tile } from '../../domain/mahjong/tile';
import { dealerOf, roundLabel, type GameEvent, type HandLog } from '../../domain/round/game';
import { useStore } from '../../store/game-store';
import { DORA_LABELS, type DoraTarget, type EditTarget } from '../../store/types';
import { Guide } from '../guide/Guide';
import { DoraEditor } from '../hand-editor/DoraEditor';
import * as ops from '../hand-editor/draft-ops';
import { meldFromSeat, SeatEditor, type MeldConfig } from '../hand-editor/SeatEditor';
import { ScoreBreakdown } from '../scoring/ScoreBreakdown';
import { fmtPoints } from '../../ui/format';
import { DrawDialog } from './DrawDialog';
import { WinDialog } from './WinDialog';

const TARGET_HINT: Record<EditTarget, string> = {
  concealed: '入力先：手牌',
  winning: '入力先：アガリ牌',
  meld: '入力先：副露',
  dora: `入力先：${DORA_LABELS.dora}`,
  kanDora: `入力先：${DORA_LABELS.kanDora}`,
  ura: `入力先：${DORA_LABELS.ura}`,
  kanUra: `入力先：${DORA_LABELS.kanUra}`,
};
const WIND_TEXT = ['東', '南', '西', '北'];

export function TableScreen({
  overviewOpen,
  onCloseOverview,
  onShowSettlement,
}: {
  overviewOpen: boolean;
  onCloseOverview: () => void;
  onShowSettlement: () => void;
}) {
  const { game, gameState, dispatch, canUndo, canRedo, replayErrors } = useStore();
  const { setOutsideHandler } = useDrag();
  const [seat, setSeat] = useState<Seat>(0);
  const [target, setTarget] = useState<EditTarget>('concealed');
  const [meldCfg, setMeldCfg] = useState<MeldConfig>({ type: 'pon', from: 'kamicha' });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'win' | 'draw' | null>(null);
  const [resultIndex, setResultIndex] = useState<number | null>(null);

  const draft = game?.draft;
  const rules = game?.rules;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const apply = useCallback(
    (r: ops.OpResult) => {
      if (r.ok) dispatch({ type: 'draft', draft: r.draft });
      else setToast(r.reason);
      return r.ok;
    },
    [dispatch],
  );

  // 手牌の牌を卓の外にドロップしたら削除
  useEffect(() => {
    if (!draft) return;
    setOutsideHandler((p) => {
      if (p.source !== 'rack') return;
      dispatch({ type: 'draft', draft: ops.removeConcealed(draft, p.seat, p.index) });
      setSelectedIndex(null);
    });
    return () => setOutsideHandler(null);
  }, [draft, dispatch, setOutsideHandler]);

  if (!game || !gameState || !draft || !rules) return null;

  const n = rules.game.playerCount;
  const seatList = seatsOf(n);
  const dealer = dealerOf(gameState);
  const sd = draft.seats[seat];
  const seats: SeatInfo[] = seatList.map((s) => ({
    name: game.players[s] ?? '',
    points: gameState.points[s]!,
    wind: seatWindOf(s, dealer, n) - 27,
    isDealer: s === dealer,
    riichi: draft.seats[s].riichi !== 'none',
  }));

  const onPick = (tile: Tile) => {
    switch (target) {
      case 'concealed':
        apply(ops.addConcealed(draft, seat, tile, rules));
        return;
      case 'winning':
        apply(ops.setWinningTile(draft, seat, tile, rules));
        return;
      case 'meld': {
        const meld = ops.buildMeld(meldCfg.type, tile, meldFromSeat(seat, meldCfg, n));
        if (typeof meld === 'string') setToast(meld);
        else apply(ops.addMeld(draft, seat, meld, rules));
        return;
      }
      default:
        apply(ops.addDora(draft, target as DoraTarget, tile, rules));
    }
  };

  const commit = (event: GameEvent) => {
    setResultIndex(gameState.logs.length);
    dispatch({ type: 'commitEvent', event });
    setDialog(null);
    setSelectedIndex(null);
    setTarget('concealed');
  };

  // 記録直後に結果を表示する
  const latest: HandLog | undefined = resultIndex !== null ? gameState.logs[resultIndex] : undefined;

  const center = (
    <div className="center-info">
      <div className="center-round">{roundLabel(gameState)}</div>
      <div className="center-deposit">供託 {gameState.deposits}本</div>
      <div className="center-dora" aria-label="ドラ表示牌">
        {draft.dora.dora.length === 0 && draft.dora.kanDora.length === 0 ? (
          <span className="muted">ドラ表示牌 未入力</span>
        ) : (
          [...draft.dora.dora, ...draft.dora.kanDora].map((t, i) => <TileView key={i} tile={t} size="xs" />)
        )}
      </div>
    </div>
  );

  return (
    <div className="table-screen">
      {replayErrors.length > 0 && (
        <p className="error" role="alert">
          対局記録の再生中に問題が見つかりました：{replayErrors[0]?.message}
        </p>
      )}
      {gameState.pending && (
        <div className="banner" role="alert">
          <p>
            オーラスで親がトップです。{gameState.pending === 'agariYame' ? 'アガリやめ' : 'テンパイやめ'}して対局を終了しますか？
          </p>
          <div className="banner-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => dispatch({ type: 'commitEvent', event: { type: 'game_ended', reason: gameState.pending! }, keepDraft: true })}
            >
              終了する
            </button>
            <span className="note">続ける場合は、そのまま次の局を入力してください。</span>
          </div>
        </div>
      )}
      {gameState.finished && (
        <div className="banner is-finished" role="status">
          <p>対局は終了しました（{gameState.endReason}）。</p>
          <button type="button" className="btn btn-primary" onClick={onShowSettlement}>
            精算を見る
          </button>
        </div>
      )}

      <MahjongTable seats={seats} selected={seat} onSelect={(s) => { setSeat(s); setSelectedIndex(null); }} center={center} draft={draft} />

      <nav className={`seat-tabs${n === 3 ? ' is-three' : ''}`} aria-label="席の切り替え">
        {seatList.map((s) => (
          <button
            key={s}
            type="button"
            className={`seat-tab${s === seat ? ' on' : ''}`}
            onClick={() => {
              setSeat(s);
              setSelectedIndex(null);
            }}
            aria-pressed={s === seat}
          >
            <span className="seat-tab-pos">{SEAT_NAMES[s]}</span>
            <span className="seat-tab-name">{game.players[s]}</span>
            <span className="seat-tab-meta">
              自風 {WIND_TEXT[seats[s]!.wind]}
              {s === dealer ? '・親' : ''}
            </span>
          </button>
        ))}
      </nav>

      <div className="editor-toolbar">
        <span className="editor-title">
          {game.players[seat]}さん <small>{fmtPoints(gameState.points[seat]!)}</small>
        </span>
        <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo} aria-label="元に戻す">
          ↶ 戻す
        </button>
        <button type="button" className="btn btn-small" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo} aria-label="やり直す">
          ↷ 進む
        </button>
      </div>

      <SeatEditor
        seat={seat}
        sd={sd}
        names={game.players}
        playerCount={n}
        allowChi={n === 4 || rules.sanma.allowChi}
        nukiEnabled={n === 3 && rules.sanma.nukiDora}
        onNuki={(count) => apply(ops.setNuki(draft, seat, count, rules))}
        target={target}
        onTarget={setTarget}
        meldCfg={meldCfg}
        onMeldCfg={setMeldCfg}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
        onInsert={(t, i) => {
          setTarget('concealed');
          apply(ops.addConcealed(draft, seat, t, rules, i));
        }}
        onMove={(from, to) => {
          dispatch({ type: 'draft', draft: ops.moveConcealed(draft, seat, from, to) });
          setSelectedIndex(null);
        }}
        onRemoveSelected={() => {
          if (selectedIndex === null) return;
          dispatch({ type: 'draft', draft: ops.removeConcealed(draft, seat, selectedIndex) });
          setSelectedIndex(null);
        }}
        onSort={() => dispatch({ type: 'draft', draft: ops.sortConcealed(draft, seat) })}
        onClear={() => {
          dispatch({ type: 'draft', draft: ops.clearSeat(draft, seat) });
          setSelectedIndex(null);
        }}
        onRemoveWinning={() => apply(ops.setWinningTile(draft, seat, null, rules))}
        onRemoveMeld={(i) => dispatch({ type: 'draft', draft: ops.removeMeld(draft, seat, i) })}
        onToggleMeldRed={(m, t) => apply(ops.toggleMeldRed(draft, seat, m, t, rules))}
        onRiichi={(r) => apply(ops.setRiichi(draft, seat, r))}
        onIppatsu={(v) => dispatch({ type: 'draft', draft: ops.setIppatsu(draft, seat, v) })}
      />

      <DoraEditor
        draft={draft}
        rules={rules}
        target={target}
        onTarget={setTarget}
        onRemove={(t, i) => dispatch({ type: 'draft', draft: ops.removeDora(draft, t, i) })}
      />

      <Guide draft={draft} seat={seat} name={game.players[seat] ?? ''} />

      <div className="action-bar">
        <button type="button" className="btn btn-primary btn-large" disabled={gameState.finished} onClick={() => setDialog('win')}>
          アガリ（点数計算）
        </button>
        <button type="button" className="btn btn-large" disabled={gameState.finished} onClick={() => setDialog('draw')}>
          流局・その他
        </button>
      </div>

      <TilePalette
        remaining={(t) => ops.remainingCount(draft, t, rules)}
        onPick={onPick}
        akaSuits={{ man: rules.dora.aka.man > 0, pin: rules.dora.aka.pin > 0, sou: rules.dora.aka.sou > 0 }}
        playerCount={n}
        hint={TARGET_HINT[target]}
      />

      {toast && (
        <div className="toast" role="alert" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      {dialog === 'win' && (
        <WinDialog
          game={gameState}
          draft={draft}
          initialWinner={seat}
          onClose={() => setDialog(null)}
          onCommit={commit}
        />
      )}
      {dialog === 'draw' && (
        <DrawDialog
          game={gameState}
          draft={draft}
          onClose={() => setDialog(null)}
          onCommit={commit}
        />
      )}
      {latest && (
        <Dialog
          title={`${latest.label} の結果`}
          onClose={() => setResultIndex(null)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setResultIndex(null)}>
              次の局へ
            </button>
          }
        >
          <p className="result-summary">{latest.summary}</p>
          {latest.results.map((r, i) => (
            <ScoreBreakdown key={i} result={r} names={game.players} />
          ))}
          {latest.results.length === 0 && (
            <ul className="yaku-list">
              {latest.transactions.map((t, i) => (
                <li key={i}>
                  <span>
                    {t.from === 'pot' ? '供託' : game.players[t.from]} → {t.to === 'pot' ? '供託' : game.players[t.to]}
                  </span>
                  <span>{fmtPoints(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="note">
            次は{roundLabel(gameState)}（供託 {gameState.deposits}本）です。
          </p>
        </Dialog>
      )}

      {overviewOpen && (
        <Dialog title="卓の俯瞰（すべての牌）" onClose={onCloseOverview} wide>
          <MahjongTable seats={seats} selected={seat} onSelect={setSeat} center={center} draft={draft} view="flat" />
          <p className="note">卓を横にスライドすると回転します。各席の手牌・アガリ牌（金枠）・副露と、中央にドラ表示牌を表示しています。</p>
        </Dialog>
      )}
    </div>
  );
}

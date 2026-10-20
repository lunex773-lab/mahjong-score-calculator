import { Seg } from '../../components/common/Dialog';
import { TileView } from '../../components/tiles/Tile';
import { TileRack } from '../../components/tiles/TileRack';
import { kamichaOf, MELD_LABELS, shimochaOf, toimenOf, type MeldType, type Seat } from '../../domain/mahjong/hand';
import { rankOf, type Tile } from '../../domain/mahjong/tile';
import type { EditTarget, RiichiState, SeatDraft } from '../../store/types';

export interface MeldConfig {
  type: MeldType;
  /** 鳴き元（上家・対面・下家） */
  from: 'kamicha' | 'toimen' | 'shimocha';
}

export const meldFromSeat = (owner: Seat, cfg: MeldConfig): Seat | undefined => {
  if (cfg.type === 'ankan') return undefined;
  if (cfg.type === 'chi') return kamichaOf(owner);
  return cfg.from === 'kamicha' ? kamichaOf(owner) : cfg.from === 'toimen' ? toimenOf(owner) : shimochaOf(owner);
};

const RELATION = (owner: Seat, from: Seat | undefined): string => {
  if (from === undefined) return '';
  if (from === kamichaOf(owner)) return '上家';
  if (from === toimenOf(owner)) return '対面';
  if (from === shimochaOf(owner)) return '下家';
  return '?';
};

/** 選択中の席の手牌・アガリ牌・副露・リーチの編集 */
export function SeatEditor({
  seat,
  sd,
  names,
  target,
  onTarget,
  meldCfg,
  onMeldCfg,
  selectedIndex,
  onSelectIndex,
  onInsert,
  onMove,
  onRemoveSelected,
  onSort,
  onClear,
  onRemoveWinning,
  onRemoveMeld,
  onToggleMeldRed,
  onRiichi,
  onIppatsu,
}: {
  seat: Seat;
  sd: SeatDraft;
  names: readonly string[];
  target: EditTarget;
  onTarget: (t: EditTarget) => void;
  meldCfg: MeldConfig;
  onMeldCfg: (c: MeldConfig) => void;
  selectedIndex: number | null;
  onSelectIndex: (i: number | null) => void;
  onInsert: (t: Tile, i: number) => void;
  onMove: (from: number, to: number) => void;
  onRemoveSelected: () => void;
  onSort: () => void;
  onClear: () => void;
  onRemoveWinning: () => void;
  onRemoveMeld: (i: number) => void;
  onToggleMeldRed: (meld: number, tile: number) => void;
  onRiichi: (r: RiichiState) => void;
  onIppatsu: (v: boolean) => void;
}) {
  const capacity = 13 - sd.melds.length * 3;
  const hasOpen = sd.melds.some((m) => m.type !== 'ankan');
  return (
    <section className="seat-editor" aria-label={`${names[seat]}さんの手牌`}>
      <div className="editor-block">
        <div className="editor-head">
          <button type="button" className={`target-chip${target === 'concealed' ? ' on' : ''}`} onClick={() => onTarget('concealed')}>
            手牌 <small>{sd.concealed.length}/{capacity}枚</small>
          </button>
          <div className="editor-tools">
            <button type="button" className="btn btn-small" onClick={onSort} disabled={sd.concealed.length < 2}>
              理牌
            </button>
            <button type="button" className="btn btn-small" onClick={onRemoveSelected} disabled={selectedIndex === null}>
              削除
            </button>
            <button type="button" className="btn btn-small" onClick={onClear}>
              クリア
            </button>
          </div>
        </div>
        <TileRack
          seat={seat}
          tiles={sd.concealed}
          selected={selectedIndex}
          onSelect={onSelectIndex}
          onInsert={onInsert}
          onMove={onMove}
          capacity={capacity}
          active={target === 'concealed'}
          onActivate={() => onTarget('concealed')}
        />
      </div>

      <div className="editor-row">
        <div className="editor-block win-block">
          <button type="button" className={`target-chip${target === 'winning' ? ' on' : ''}`} onClick={() => onTarget('winning')}>
            アガリ牌
          </button>
          <div className={`slot${target === 'winning' ? ' is-active' : ''}`} onClick={() => onTarget('winning')}>
            {sd.winningTile ? (
              <button type="button" className="slot-tile" onClick={onRemoveWinning} aria-label="アガリ牌を外す">
                <TileView tile={sd.winningTile} size="md" />
              </button>
            ) : (
              <span className="slot-empty">？</span>
            )}
          </div>
        </div>

        <div className="editor-block riichi-block">
          <span className="block-label">リーチ</span>
          <Seg
            small
            value={sd.riichi}
            onChange={onRiichi}
            label="リーチ"
            options={[
              { value: 'none', label: 'なし' },
              { value: 'riichi', label: 'リーチ', disabled: hasOpen },
              { value: 'double', label: 'Wリーチ', disabled: hasOpen },
            ]}
          />
          <label className={`check${sd.riichi === 'none' ? ' is-disabled' : ''}`}>
            <input type="checkbox" checked={sd.ippatsu} disabled={sd.riichi === 'none'} onChange={(e) => onIppatsu(e.target.checked)} />
            <span>一発</span>
          </label>
        </div>
      </div>

      <div className="editor-block">
        <div className="editor-head">
          <button type="button" className={`target-chip${target === 'meld' ? ' on' : ''}`} onClick={() => onTarget('meld')}>
            副露（鳴き・槓） <small>{sd.melds.length}/4組</small>
          </button>
        </div>
        {target === 'meld' && (
          <div className="meld-config">
            <Seg
              small
              label="副露の種類"
              value={meldCfg.type}
              onChange={(type) => onMeldCfg({ ...meldCfg, type })}
              options={(['chi', 'pon', 'minkan', 'kakan', 'ankan'] as MeldType[]).map((t) => ({ value: t, label: MELD_LABELS[t] }))}
            />
            {meldCfg.type !== 'ankan' && meldCfg.type !== 'chi' && (
              <Seg
                small
                label="鳴き元"
                value={meldCfg.from}
                onChange={(from) => onMeldCfg({ ...meldCfg, from })}
                options={[
                  { value: 'kamicha', label: `上家（${names[kamichaOf(seat)]}）` },
                  { value: 'toimen', label: `対面（${names[toimenOf(seat)]}）` },
                  { value: 'shimocha', label: `下家（${names[shimochaOf(seat)]}）` },
                ]}
              />
            )}
            <p className="note">
              {meldCfg.type === 'chi'
                ? `チーは上家（${names[kamichaOf(seat)]}）から。順子の一番小さい牌をタップしてください。`
                : `${MELD_LABELS[meldCfg.type]}する牌をタップしてください。`}
              五を含む副露は、追加後に五をタップすると赤⇔通常を切り替えられます。
            </p>
          </div>
        )}
        <div className="melds">
          {sd.melds.length === 0 && <span className="muted">副露はありません</span>}
          {sd.melds.map((m, i) => (
            <div key={i} className="meld">
              <span className="meld-tag">
                {MELD_LABELS[m.type]}
                {m.calledFrom !== undefined && <small>（{RELATION(seat, m.calledFrom)}）</small>}
              </span>
              <span className="meld-tiles">
                {m.tiles.map((t, j) => (
                  <button
                    key={j}
                    type="button"
                    className="meld-tile"
                    disabled={rankOf(t.kind) !== 5}
                    onClick={() => onToggleMeldRed(i, j)}
                    aria-label={rankOf(t.kind) === 5 ? '赤⇔通常を切り替え' : undefined}
                  >
                    <TileView tile={t} size="sm" />
                  </button>
                ))}
              </span>
              <button type="button" className="icon-btn" onClick={() => onRemoveMeld(i)} aria-label="この副露を削除">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

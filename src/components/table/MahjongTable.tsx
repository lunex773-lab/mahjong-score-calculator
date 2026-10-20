import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MELD_LABELS, type Seat } from '../../domain/mahjong/hand';
import { tileLabel } from '../../domain/mahjong/tile';
import type { HandDraft } from '../../store/types';
import { TileView } from '../tiles/Tile';

/**
 * 麻雀卓。選択した席が手前（下）に来るよう卓全体を回転させる。
 * 東席を下に置いたとき、南席（下家）は右、西席（対面）は上、北席（上家）は左。
 * 中央の情報は回転を打ち消して常に読める向きにする。
 */

const WIND_TEXT = ['東', '南', '西', '北'];
const POSITION_CLASS = ['pos-bottom', 'pos-right', 'pos-top', 'pos-left'];

export interface SeatInfo {
  name: string;
  points: number;
  /** 自風（0=東…3=北） */
  wind: number;
  isDealer: boolean;
  riichi: boolean;
}

/** 0→3 のように一周するとき逆回りしないよう、累積角度で回転させる */
function useCumulativeRotation(selected: Seat): number {
  const [angle, setAngle] = useState(selected * 90);
  const prev = useRef(selected);
  useEffect(() => {
    const delta = (selected - prev.current + 4) % 4;
    prev.current = selected;
    if (delta === 0) return;
    setAngle((a) => a + (delta === 3 ? -90 : delta * 90));
  }, [selected]);
  return angle;
}

export function MahjongTable({
  seats,
  selected,
  onSelect,
  center,
  draft,
  overview = false,
}: {
  seats: SeatInfo[];
  selected: Seat;
  onSelect: (s: Seat) => void;
  center: ReactNode;
  draft?: HandDraft;
  overview?: boolean;
}) {
  const angle = useCumulativeRotation(selected);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={`table-stage${overview ? ' is-overview' : ''}`}
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          // 左へスワイプ = 卓を時計回りに回し、右隣（下家）の席を手前へ
          onSelect((((selected + (dx < 0 ? 1 : 3)) % 4) as Seat));
        }
      }}
    >
      <div className="table" style={{ transform: `rotate(${angle}deg)` }} aria-label="麻雀卓">
        <div className="table-felt" />
        {([0, 1, 2, 3] as Seat[]).map((seat) => {
          const info = seats[seat]!;
          const sd = draft?.seats[seat];
          return (
            <div key={seat} className={`seat-layer ${POSITION_CLASS[seat]}`}>
            <button
              type="button"
              className={`seat-plate${seat === selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(seat)}
              aria-label={`${info.name}（自風${WIND_TEXT[info.wind]}${info.isDealer ? '・親' : ''}）${info.points}点`}
            >
              <span className="seat-line">
                <span className={`wind-badge${info.isDealer ? ' is-dealer' : ''}`}>{WIND_TEXT[info.wind]}</span>
                <span className="seat-name">{info.name}</span>
                {info.isDealer && <span className="dealer-mark">親</span>}
              </span>
              <span className="seat-points">{info.points.toLocaleString()}</span>
              {info.riichi && <span className="riichi-stick" title="リーチ" />}
              {overview && sd && (
                <span className="overview-hand">
                  <span className="overview-row">
                    {sd.concealed.map((t, i) => (
                      <TileView key={i} tile={t} size="xs" />
                    ))}
                    {sd.winningTile && (
                      <span className="overview-win">
                        <TileView tile={sd.winningTile} size="xs" />
                      </span>
                    )}
                    {sd.concealed.length === 0 && !sd.winningTile && <span className="overview-empty">（未入力）</span>}
                  </span>
                  {sd.melds.length > 0 && (
                    <span className="overview-row">
                      {sd.melds.map((m, i) => (
                        <span key={i} className="overview-meld" title={MELD_LABELS[m.type]}>
                          {m.tiles.map((t, j) => (
                            <TileView key={j} tile={t} size="xs" faceDown={m.type === 'ankan' && (j === 0 || j === 3)} />
                          ))}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              )}
              {!overview && sd && (
                <span className="seat-count">
                  {sd.concealed.length + sd.melds.length * 3}
                  {sd.winningTile ? `+${tileLabel(sd.winningTile)}` : ''}
                </span>
              )}
            </button>
            </div>
          );
        })}
        <div className="table-center" style={{ transform: `translate(-50%, -50%) rotate(${-angle}deg)` }}>
          {center}
        </div>
      </div>
    </div>
  );
}

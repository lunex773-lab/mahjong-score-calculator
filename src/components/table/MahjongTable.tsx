import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { MELD_LABELS, type Seat } from '../../domain/mahjong/hand';
import { tileLabel } from '../../domain/mahjong/tile';
import type { HandDraft } from '../../store/types';
import { fmtNumber } from '../../ui/format';
import { TileView } from '../tiles/Tile';

/**
 * 麻雀卓。東席を手前に置いたとき、南席（下家）は右、西席（対面）は奥、北席（上家）は左。
 *
 * - '3d'   : 自分の席から斜めに見下ろす立体の卓。指の横スライドに合わせてターンテーブルのように回り、
 *            離すと最寄りの席で止まる。席の札と中央の情報は常にこちらを向く（ビルボード表示）。
 * - 'flat' : 真上からの俯瞰。全員の手牌・副露を卓の向きどおりに並べる。
 */

const WIND_TEXT = ['東', '南', '西', '北'];
const POSITION_CLASS = ['pos-bottom', 'pos-right', 'pos-top', 'pos-left'];
/** 各席の札を卓の辺に置くための回転（下・右・上・左） */
const LAYER_ANGLE = [0, -90, 180, 90];
/** 卓の傾き（度）。大きいほど寝かせて見える */
const TILT = 54;
/** 何px スライドすると1席（90度）回るか */
const PX_PER_SEAT = 110;

export interface SeatInfo {
  name: string;
  points: number;
  /** 自風（0=東…3=北） */
  wind: number;
  isDealer: boolean;
  riichi: boolean;
}

interface Props {
  /** 座席順の情報。3人打ちは3人分（北席は空席として表示し、止まらない） */
  seats: SeatInfo[];
  selected: Seat;
  onSelect: (s: Seat) => void;
  center: ReactNode;
  draft?: HandDraft;
  view?: '3d' | 'flat';
}

export const seatOfAngle = (angle: number): Seat => ((((Math.round(angle / 90) % 4) + 4) % 4) as Seat);

/** 0→3 のように一周するとき逆回りしないよう、最短方向の目標角度を求める */
export const nearestAngleFor = (current: number, seat: Seat): number => {
  const base = Math.round(current / 360) * 360 + seat * 90;
  return [base - 360, base, base + 360].reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a));
};

interface DragState {
  x: number;
  y: number;
  start: number;
  lastX: number;
  lastT: number;
  v: number;
  active: boolean;
}

/** 空席では止まらないよう、回した向きにある次の席の角度へずらす */
export function snapToAvailable(target: number, direction: number, seatCount: number): number {
  let angle = target;
  for (let i = 0; i < 4 && seatOfAngle(angle) >= seatCount; i++) angle += direction >= 0 ? 90 : -90;
  return angle;
}

/** 卓の角度。ドラッグ中は指に追従させ、離したら最寄りの席までアニメーションさせる */
function useTurntable(selected: Seat, onSelect: (s: Seat) => void, seatCount: number) {
  const [angle, setAngle] = useState(selected * 90);
  const angleRef = useRef(angle);
  const frame = useRef<number | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  const set = useCallback((a: number) => {
    angleRef.current = a;
    setAngle(a);
  }, []);

  const animateTo = useCallback(
    (target: number) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      const from = angleRef.current;
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration = reduce ? 0 : Math.min(520, 220 + Math.abs(target - from) * 2.2);
      const t0 = performance.now();
      const step = (now: number) => {
        const p = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
        set(from + (target - from) * (1 - (1 - p) ** 3));
        frame.current = p < 1 ? requestAnimationFrame(step) : null;
      };
      frame.current = requestAnimationFrame(step);
    },
    [set],
  );

  // タブなど外部から席が変わったときは最短方向に回す
  useEffect(() => {
    if (drag.current?.active) return;
    const target = nearestAngleFor(angleRef.current, selected);
    if (Math.abs(target - angleRef.current) > 0.01) animateTo(target);
  }, [selected, animateTo]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, start: angleRef.current, lastX: e.clientX, lastT: e.timeStamp, v: 0, active: false };
      suppressClick.current = false;
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.active) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
        d.active = true;
        suppressClick.current = true;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        d.start = angleRef.current;
        d.x = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        return;
      }
      const dt = Math.max(1, e.timeStamp - d.lastT);
      d.v = (e.clientX - d.lastX) / dt;
      d.lastX = e.clientX;
      d.lastT = e.timeStamp;
      // 左へスライド = 卓が時計回り = 右隣（下家）の席が手前へ
      set(d.start - ((e.clientX - d.x) / PX_PER_SEAT) * 90);
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d?.active) return;
      // はじいた速度も考慮して止まる席を決める（惰性は最大1席分）。指を止めてから離した場合ははじきとみなさない
      const v = e.timeStamp - d.lastT > 80 ? 0 : d.v;
      const fling = Math.abs(v) > 0.35 ? -Math.sign(v) * 0.6 : 0;
      const turned = angleRef.current - d.start;
      const target = snapToAvailable(Math.round(angleRef.current / 90 + fling) * 90, turned, seatCount);
      animateTo(target);
      const seat = seatOfAngle(target);
      if (seat !== selected) onSelect(seat);
    },
    onPointerCancel: () => {
      const d = drag.current;
      drag.current = null;
      if (d?.active) animateTo(nearestAngleFor(angleRef.current, selected));
    },
    onClickCapture: (e: ReactMouseEvent) => {
      // スライド操作の直後に席の札のクリックが発火しないようにする
      if (suppressClick.current) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick.current = false;
      }
    },
  };
  return { angle, handlers };
}

function PlateContent({ info, overview, sd }: { info: SeatInfo; overview: boolean; sd: HandDraft['seats'][number] | undefined }) {
  return (
    <>
      <span className="seat-line">
        <span className={`wind-badge${info.isDealer ? ' is-dealer' : ''}`}>{WIND_TEXT[info.wind]}</span>
        <span className="seat-name">{info.name}</span>
        {info.isDealer && <span className="dealer-mark">親</span>}
        {overview && <span className="seat-points">{fmtNumber(info.points)}</span>}
      </span>
      {!overview && <span className="seat-points">{fmtNumber(info.points)}</span>}
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
      {!overview && sd && (sd.concealed.length > 0 || sd.melds.length > 0 || sd.winningTile) && (
        <span className="seat-count">
          手牌{sd.concealed.length + sd.melds.length * 3}枚
          {sd.winningTile ? `＋${tileLabel(sd.winningTile)}` : ''}
        </span>
      )}
    </>
  );
}

export function MahjongTable({ seats, selected, onSelect, center, draft, view = '3d' }: Props) {
  const { angle, handlers } = useTurntable(selected, onSelect, seats.length);
  const is3d = view === '3d';
  // 3D では札を「卓の回転と辺の向きを打ち消し → 起こす」ことで常に正面を向かせる
  const billboard = (layer: number): CSSProperties | undefined =>
    is3d ? { transform: `rotateZ(${-(angle + layer)}deg) rotateX(${-TILT}deg)` } : undefined;
  const front = seatOfAngle(angle);

  return (
    <div className={`table-stage ${is3d ? 'is-3d' : 'is-overview'}`} {...handlers}>
      <div className="table-tilt" style={is3d ? { transform: `rotateX(${TILT}deg)` } : undefined}>
        <div className="table" style={{ transform: `rotateZ(${angle}deg)` }} aria-label="麻雀卓">
          {is3d && <div className="table-skirt" aria-hidden="true" />}
          <div className="table-felt" />
          {([0, 1, 2, 3] as Seat[]).map((seat) => {
            const info = seats[seat];
            if (!info) {
              // 3人打ちの北席（誰も座らない）
              return (
                <div key={seat} className={`seat-layer ${POSITION_CLASS[seat]}`}>
                  <div className="seat-plate is-empty" style={billboard(LAYER_ANGLE[seat]!)} aria-hidden="true">
                    <span className="seat-line">空席（北）</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={seat} className={`seat-layer ${POSITION_CLASS[seat]}`}>
                <button
                  type="button"
                  className={`seat-plate${seat === selected ? ' is-selected' : ''}${is3d && seat === front ? ' is-front' : ''}`}
                  style={billboard(LAYER_ANGLE[seat]!)}
                  onClick={() => onSelect(seat)}
                  aria-label={`${info.name}（自風${WIND_TEXT[info.wind]}${info.isDealer ? '・親' : ''}）${info.points}点`}
                >
                  <PlateContent info={info} overview={!is3d} sd={draft?.seats[seat]} />
                </button>
              </div>
            );
          })}
          <div
            className="table-center"
            style={{
              transform: is3d
                ? `translate(-50%, -100%) rotateZ(${-angle}deg) rotateX(${-TILT}deg)`
                : `translate(-50%, -50%) rotate(${-angle}deg)`,
            }}
          >
            {center}
          </div>
        </div>
      </div>
      {is3d && (
        <p className="table-hint" aria-hidden="true">
          ← 卓を横にスライドして席を回す →
        </p>
      )}
    </div>
  );
}

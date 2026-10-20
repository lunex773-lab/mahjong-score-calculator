import { useEffect, useId, useRef, useState } from 'react';
import type { Seat } from '../../domain/mahjong/hand';
import type { Tile } from '../../domain/mahjong/tile';
import { TileView } from './Tile';
import { useDrag, usePressable, type DragPayload } from './drag';

/** 手牌の列。ドラッグで並べ替え・挿入位置の表示、タップで選択。 */

function RackTile({
  seat,
  index,
  tile,
  selected,
  onSelect,
  hidden,
}: {
  seat: Seat;
  index: number;
  tile: Tile;
  selected: boolean;
  onSelect: (i: number) => void;
  hidden: boolean;
}) {
  const onPointerDown = usePressable({ source: 'rack', seat, index, tile }, () => onSelect(index));
  return (
    <button
      type="button"
      className={`rack-tile${hidden ? ' is-dragging' : ''}`}
      data-rack-index={index}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(index);
        }
      }}
      aria-pressed={selected}
    >
      <TileView tile={tile} size="md" selected={selected} />
    </button>
  );
}

function insertionIndex(container: HTMLElement, x: number, y: number): number {
  const items = [...container.querySelectorAll<HTMLElement>('[data-rack-index]')];
  if (items.length === 0) return 0;
  let best = items.length;
  let bestDist = Infinity;
  items.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    const cx = r.left + r.width / 2;
    const d = Math.hypot(cx - x, (cy - y) * 2);
    if (d < bestDist) {
      bestDist = d;
      best = x < cx ? i : i + 1;
    }
  });
  return best;
}

export function TileRack({
  seat,
  tiles,
  selected,
  onSelect,
  onInsert,
  onMove,
  capacity,
  active,
  onActivate,
}: {
  seat: Seat;
  tiles: readonly Tile[];
  selected: number | null;
  onSelect: (i: number | null) => void;
  onInsert: (tile: Tile, index: number) => void;
  onMove: (from: number, to: number) => void;
  capacity: number;
  active: boolean;
  onActivate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const { drag, register } = useDrag();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const handlers = useRef({ onInsert, onMove });
  handlers.current = { onInsert, onMove };

  const inside = (x: number, y: number) => {
    const r = ref.current?.getBoundingClientRect();
    return !!r && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 16 && y <= r.bottom + 16;
  };

  useEffect(() => {
    if (!drag || !ref.current || !inside(drag.x, drag.y)) {
      setHoverIndex(null);
      return;
    }
    setHoverIndex(insertionIndex(ref.current, drag.x, drag.y));
  }, [drag]);

  useEffect(
    () =>
      register({
        id,
        drop: (p: DragPayload, x, y) => {
          if (!ref.current || !inside(x, y)) return false;
          const idx = insertionIndex(ref.current, x, y);
          if (p.source === 'palette') handlers.current.onInsert(p.tile, idx);
          else if (p.seat === seat) handlers.current.onMove(p.index, idx);
          else return false;
          return true;
        },
      }),
    [register, id, seat],
  );

  const draggingIndex = drag?.payload.source === 'rack' && drag.payload.seat === seat ? drag.payload.index : null;
  const slots = [];
  for (let i = 0; i <= tiles.length; i++) {
    if (hoverIndex === i) slots.push(<span key={`ins-${i}`} className="insert-marker" aria-hidden="true" />);
    const t = tiles[i];
    if (t) {
      slots.push(
        <RackTile
          key={i}
          seat={seat}
          index={i}
          tile={t}
          selected={selected === i}
          onSelect={(idx) => onSelect(selected === idx ? null : idx)}
          hidden={draggingIndex === i}
        />,
      );
    }
  }
  const empty = Math.max(0, capacity - tiles.length);
  return (
    <div
      ref={ref}
      className={`rack${active ? ' is-active' : ''}${hoverIndex !== null ? ' is-drop' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onActivate();
      }}
    >
      {slots}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e-${i}`} className="rack-empty" onClick={onActivate} aria-hidden="true" />
      ))}
    </div>
  );
}

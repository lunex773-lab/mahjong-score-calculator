import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Seat } from '../../domain/mahjong/hand';
import type { Tile } from '../../domain/mahjong/tile';
import { TileView } from './Tile';

/**
 * ポインターイベントによるドラッグ＆ドロップ（マウス・タッチ共通）。
 * 8px 未満の移動はタップとして扱い、タップだけでも全操作を完了できるようにする。
 */

export type DragPayload =
  | { source: 'palette'; tile: Tile }
  | { source: 'rack'; seat: Seat; index: number; tile: Tile };

export interface DropTarget {
  id: string;
  /** 受け付けたら true */
  drop: (payload: DragPayload, x: number, y: number) => boolean;
}

interface DragState {
  payload: DragPayload;
  x: number;
  y: number;
}

interface DragContextValue {
  drag: DragState | null;
  start: (payload: DragPayload, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (x: number, y: number) => void;
  cancel: () => void;
  register: (t: DropTarget) => () => void;
  setOutsideHandler: (fn: ((p: DragPayload) => void) | null) => void;
}

const DragContext = createContext<DragContextValue | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const targets = useRef(new Map<string, DropTarget>());
  const outside = useRef<((p: DragPayload) => void) | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const start = useCallback((payload: DragPayload, x: number, y: number) => setDrag({ payload, x, y }), []);
  const move = useCallback((x: number, y: number) => setDrag((d) => (d ? { ...d, x, y } : d)), []);
  const cancel = useCallback(() => setDrag(null), []);
  const end = useCallback((x: number, y: number) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    for (const t of targets.current.values()) {
      if (t.drop(d.payload, x, y)) return;
    }
    // どこにも落とさなかった手牌の牌は削除する
    if (d.payload.source === 'rack') outside.current?.(d.payload);
  }, []);
  const register = useCallback((t: DropTarget) => {
    targets.current.set(t.id, t);
    return () => {
      targets.current.delete(t.id);
    };
  }, []);
  const setOutsideHandler = useCallback((fn: ((p: DragPayload) => void) | null) => {
    outside.current = fn;
  }, []);

  const value = useMemo(
    () => ({ drag, start, move, end, cancel, register, setOutsideHandler }),
    [drag, start, move, end, cancel, register, setOutsideHandler],
  );
  return (
    <DragContext.Provider value={value}>
      {children}
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <TileView tile={drag.payload.tile} size="lg" />
        </div>
      )}
    </DragContext.Provider>
  );
}

export function useDrag(): DragContextValue {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('DragProvider がありません');
  return ctx;
}

const THRESHOLD = 8;

/** タップとドラッグの両方に対応するポインター操作 */
export function usePressable(payload: DragPayload | null, onTap: () => void) {
  const { start, move, end, cancel } = useDrag();
  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  useEffect(() => cancel, [cancel]);

  return useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      const onMove = (ev: PointerEvent) => {
        if (!dragging && payload && Math.hypot(ev.clientX - sx, ev.clientY - sy) > THRESHOLD) {
          dragging = true;
          start(payload, ev.clientX, ev.clientY);
        }
        if (dragging) {
          ev.preventDefault();
          move(ev.clientX, ev.clientY);
        }
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };
      const onUp = (ev: PointerEvent) => {
        cleanup();
        if (dragging) end(ev.clientX, ev.clientY);
        else tapRef.current();
      };
      const onCancel = () => {
        cleanup();
        if (dragging) cancel();
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [payload, start, move, end, cancel],
  );
}

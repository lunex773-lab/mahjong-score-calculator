import { useState } from 'react';
import { isUsableKind, kindOf, tileLabel, type Suit, type Tile } from '../../domain/mahjong/tile';
import { TileView } from './Tile';
import { usePressable } from './drag';

/** 画面下部の牌一覧。タップで編集先へ追加、ドラッグで手牌の任意の位置へ配置する。 */

const TABS: { suit: Suit; label: string }[] = [
  { suit: 'man', label: '萬子' },
  { suit: 'pin', label: '筒子' },
  { suit: 'sou', label: '索子' },
  { suit: 'honor', label: '字牌' },
];

function tilesOf(suit: Suit, showRed: boolean, playerCount: 3 | 4): Tile[] {
  if (suit === 'honor') return Array.from({ length: 7 }, (_, i) => ({ kind: 27 + i, red: false }));
  const out: Tile[] = [];
  for (let r = 1; r <= 9; r++) {
    // 3人打ちは二萬〜八萬を使わない（入力できないようにする）
    if (!isUsableKind(kindOf(suit, r), playerCount)) continue;
    out.push({ kind: kindOf(suit, r), red: false });
    if (r === 5 && showRed) out.push({ kind: kindOf(suit, 5), red: true });
  }
  return out;
}

function PaletteTile({ tile, remaining, onPick }: { tile: Tile; remaining: number; onPick: (t: Tile) => void }) {
  const disabled = remaining <= 0;
  const onPointerDown = usePressable(disabled ? null : { source: 'palette', tile }, () => {
    if (!disabled) onPick(tile);
  });
  return (
    <button
      type="button"
      className="palette-tile"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          onPick(tile);
        }
      }}
      aria-label={`${tileLabel(tile)}を追加（残り${remaining}枚）`}
    >
      <TileView tile={tile} size="md" dimmed={disabled} />
      <span className="palette-count">{remaining}</span>
    </button>
  );
}

export function TilePalette({
  remaining,
  onPick,
  akaSuits,
  hint,
  playerCount,
}: {
  remaining: (t: Tile) => number;
  onPick: (t: Tile) => void;
  akaSuits: Record<'man' | 'pin' | 'sou', boolean>;
  hint: string;
  playerCount: 3 | 4;
}) {
  const [suit, setSuit] = useState<Suit>('man');
  return (
    <section className="palette" aria-label="牌一覧">
      <div className="palette-head">
        <div className="seg seg-small" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.suit}
              type="button"
              role="tab"
              aria-selected={suit === t.suit}
              className={suit === t.suit ? 'on' : ''}
              onClick={() => setSuit(t.suit)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="palette-hint">{hint}</p>
      </div>
      <div className="palette-grid">
        {tilesOf(suit, suit !== 'honor' && akaSuits[suit as 'man' | 'pin' | 'sou'], playerCount).map((tile) => (
          <PaletteTile key={`${tile.kind}-${tile.red}`} tile={tile} remaining={remaining(tile)} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

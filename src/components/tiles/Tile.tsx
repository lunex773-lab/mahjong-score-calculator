import { memo } from 'react';
import { rankOf, suitOf, tileLabel, type Tile as TileData } from '../../domain/mahjong/tile';

/**
 * 牌の描画。画像やフォントの素材を使わず SVG で描くため、ライセンス上の制約がない。
 * 萬子は漢数字＋萬、筒子は円、索子は竹、字牌は漢字で表す。
 */

type Pt = readonly [number, number];

const PIN: Record<number, readonly Pt[]> = {
  2: [[15, 11], [15, 29]],
  3: [[8, 8], [15, 20], [22, 32]],
  4: [[9, 11], [21, 11], [9, 29], [21, 29]],
  5: [[9, 9], [21, 9], [15, 20], [9, 31], [21, 31]],
  6: [[10, 8], [20, 8], [10, 20], [20, 20], [10, 32], [20, 32]],
  7: [[7, 6], [15, 10], [23, 14], [10, 24], [20, 24], [10, 33], [20, 33]],
  8: [[10, 6], [20, 6], [10, 15], [20, 15], [10, 25], [20, 25], [10, 34], [20, 34]],
  9: [[7, 8], [15, 8], [23, 8], [7, 20], [15, 20], [23, 20], [7, 32], [15, 32], [23, 32]],
};
const PIN_R: Record<number, number> = { 2: 5.5, 3: 4.6, 4: 4.8, 5: 4.4, 6: 4.2, 7: 3.6, 8: 3.6, 9: 3.4 };

const SOU: Record<number, readonly Pt[]> = {
  2: [[15, 11], [15, 29]],
  3: [[15, 11], [9, 29], [21, 29]],
  4: [[10, 11], [20, 11], [10, 29], [20, 29]],
  5: [[8, 11], [22, 11], [15, 20], [8, 29], [22, 29]],
  6: [[7, 11], [15, 11], [23, 11], [7, 29], [15, 29], [23, 29]],
  7: [[15, 7], [7, 20], [15, 20], [23, 20], [7, 33], [15, 33], [23, 33]],
  8: [[6, 11], [12, 11], [18, 11], [24, 11], [6, 29], [12, 29], [18, 29], [24, 29]],
  9: [[7, 7], [15, 7], [23, 7], [7, 20], [15, 20], [23, 20], [7, 33], [15, 33], [23, 33]],
};

const MAN_NUMERALS = ['一', '二', '三', '四', '伍', '六', '七', '八', '九'];
const HONOR_TEXT = ['東', '南', '西', '北', '', '發', '中'];

const INK = '#1f2a44';
const RED = '#c62828';
const GREEN = '#1b7a3a';
const BLUE = '#1e4f9c';

function PinFace({ rank, red }: { rank: number; red: boolean }) {
  if (rank === 1) {
    return (
      <g>
        <circle cx={15} cy={20} r={11} fill="none" stroke={GREEN} strokeWidth={2.2} />
        <circle cx={15} cy={20} r={7} fill={red ? RED : BLUE} />
        <circle cx={15} cy={20} r={3} fill="#fff" />
      </g>
    );
  }
  const r = PIN_R[rank] ?? 4;
  return (
    <g>
      {(PIN[rank] ?? []).map(([x, y], i) => {
        const color = red || (rank === 5 && i === 2) || (rank === 7 && i < 3) ? RED : i % 2 === 0 ? BLUE : GREEN;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill="none" stroke={red ? RED : color} strokeWidth={1.4} />
            <circle cx={x} cy={y} r={r * 0.45} fill={red ? RED : color} />
          </g>
        );
      })}
    </g>
  );
}

function SouFace({ rank, red }: { rank: number; red: boolean }) {
  if (rank === 1) {
    return (
      <g>
        <ellipse cx={15} cy={22} rx={7} ry={10} fill={GREEN} />
        <circle cx={15} cy={10} r={4.5} fill={GREEN} />
        <path d="M15 6 l3 -3 l-1 4 z" fill={RED} />
        <circle cx={16} cy={9.5} r={1} fill="#fff" />
        <path d="M10 28 q5 8 10 0" fill="none" stroke={RED} strokeWidth={1.6} />
      </g>
    );
  }
  const h = rank >= 7 ? 9 : 12;
  return (
    <g>
      {(SOU[rank] ?? []).map(([x, y], i) => {
        const isRed = red || (rank === 5 && i === 2) || (rank === 7 && i === 0) || (rank === 9 && i % 3 === 1);
        const color = isRed ? RED : GREEN;
        return (
          <g key={i}>
            <rect x={x - 1.8} y={y - h / 2} width={3.6} height={h} rx={1.6} fill={color} />
            <line x1={x - 1.8} x2={x + 1.8} y1={y} y2={y} stroke="#fff" strokeWidth={0.8} />
          </g>
        );
      })}
    </g>
  );
}

function ManFace({ rank, red }: { rank: number; red: boolean }) {
  return (
    <g fontFamily="'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif" fontWeight={700} textAnchor="middle">
      <text x={15} y={17} fontSize={13} fill={red ? RED : INK}>
        {MAN_NUMERALS[rank - 1]}
      </text>
      <text x={15} y={35} fontSize={14} fill={RED}>
        萬
      </text>
    </g>
  );
}

function HonorFace({ index }: { index: number }) {
  if (index === 4) {
    return <rect x={7} y={8} width={16} height={24} rx={1.5} fill="none" stroke={BLUE} strokeWidth={2} />;
  }
  const color = index === 5 ? GREEN : index === 6 ? RED : INK;
  return (
    <text
      x={15}
      y={28}
      fontSize={20}
      textAnchor="middle"
      fontWeight={700}
      fontFamily="'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif"
      fill={color}
    >
      {HONOR_TEXT[index]}
    </text>
  );
}

export interface TileProps {
  tile: TileData;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  dimmed?: boolean;
  /** 横向き（鳴いた牌） */
  sideways?: boolean;
  /** 裏向き */
  faceDown?: boolean;
  className?: string;
}

export const TileView = memo(function TileView({
  tile,
  size = 'md',
  selected,
  dimmed,
  sideways,
  faceDown,
  className,
}: TileProps) {
  const suit = suitOf(tile.kind);
  const rank = rankOf(tile.kind) ?? 0;
  const cls = ['tile', `tile-${size}`, selected && 'is-selected', dimmed && 'is-dimmed', sideways && 'is-sideways', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} role="img" aria-label={faceDown ? '裏向きの牌' : tileLabel(tile)} data-tile={tileLabel(tile)}>
      <svg viewBox="0 0 30 40" aria-hidden="true">
        {faceDown ? (
          <rect x={0} y={0} width={30} height={40} rx={3} fill="#2e7d5b" />
        ) : (
          <>
            {suit === 'man' && <ManFace rank={rank} red={tile.red} />}
            {suit === 'pin' && <PinFace rank={rank} red={tile.red} />}
            {suit === 'sou' && <SouFace rank={rank} red={tile.red} />}
            {suit === 'honor' && <HonorFace index={tile.kind - 27} />}
            {tile.red && <circle cx={26} cy={4} r={2} fill={RED} />}
          </>
        )}
      </svg>
    </span>
  );
});

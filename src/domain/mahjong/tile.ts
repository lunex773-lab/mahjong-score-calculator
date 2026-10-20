/**
 * 牌の定義（仕様書 第2章）。
 * 牌種は 0〜33 の整数で表す: 0-8 萬子1-9 / 9-17 筒子1-9 / 18-26 索子1-9 / 27-30 東南西北 / 31-33 白發中。
 * 物理牌は牌種と赤ドラ属性の組で表し、赤五は通常の五と同じ牌種の内数として扱う。
 */

export type Suit = 'man' | 'pin' | 'sou' | 'honor';
export type TileKind = number;
export type HonorName = 'east' | 'south' | 'west' | 'north' | 'white' | 'green' | 'red';

export interface Tile {
  readonly kind: TileKind;
  readonly red: boolean;
}

export const KIND_COUNT = 34;
export const COPIES_PER_KIND = 4;

export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const WHITE = 31;
export const GREEN = 32;
export const RED = 33;

export const WINDS = [EAST, SOUTH, WEST, NORTH] as const;
export const DRAGONS = [WHITE, GREEN, RED] as const;

const SUITS: readonly Suit[] = ['man', 'pin', 'sou'];
const HONOR_NAMES: readonly HonorName[] = ['east', 'south', 'west', 'north', 'white', 'green', 'red'];
const HONOR_LABELS = ['東', '南', '西', '北', '白', '發', '中'];
const SUIT_LABELS: Record<Suit, string> = { man: '萬', pin: '筒', sou: '索', honor: '字' };
const SUIT_CODES: Record<Suit, string> = { man: 'm', pin: 'p', sou: 's', honor: 'z' };

export function isValidKind(kind: number): boolean {
  return Number.isInteger(kind) && kind >= 0 && kind < KIND_COUNT;
}

export function suitOf(kind: TileKind): Suit {
  if (kind < 27) return SUITS[Math.floor(kind / 9)] as Suit;
  return 'honor';
}

/** 数牌の数字（1〜9）。字牌は null。 */
export function rankOf(kind: TileKind): number | null {
  return kind < 27 ? (kind % 9) + 1 : null;
}

export function honorOf(kind: TileKind): HonorName | null {
  return kind >= 27 ? (HONOR_NAMES[kind - 27] ?? null) : null;
}

export const isHonor = (kind: TileKind): boolean => kind >= 27;
export const isWind = (kind: TileKind): boolean => kind >= EAST && kind <= NORTH;
export const isDragon = (kind: TileKind): boolean => kind >= WHITE;
export const isTerminal = (kind: TileKind): boolean => {
  const r = rankOf(kind);
  return r === 1 || r === 9;
};
/** 么九牌（老頭牌＋字牌） */
export const isYaochu = (kind: TileKind): boolean => isHonor(kind) || isTerminal(kind);
/** 中張牌（2〜8の数牌） */
export const isSimple = (kind: TileKind): boolean => !isYaochu(kind);

export const kindOf = (suit: Suit, rank: number): TileKind => {
  if (suit === 'honor') return 27 + rank - 1;
  return SUITS.indexOf(suit) * 9 + rank - 1;
};

export const YAOCHU_KINDS: readonly TileKind[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** 3人打ちで使わない牌（二萬〜八萬） */
export const SANMA_EXCLUDED_KINDS: readonly TileKind[] = [1, 2, 3, 4, 5, 6, 7];
export const isUsableKind = (kind: TileKind, playerCount: 3 | 4): boolean =>
  isValidKind(kind) && !(playerCount === 3 && SANMA_EXCLUDED_KINDS.includes(kind));

/**
 * ドラ表示牌から次のドラ牌を求める（4人打ち仕様書 2.3）。
 * 3人打ちの萬子は一萬と九萬しかないため、一萬→九萬、九萬→一萬とする（3人打ち仕様書 1.4）。
 */
export function doraFromIndicator(indicator: TileKind, playerCount: 3 | 4 = 4): TileKind {
  if (playerCount === 3 && indicator === 0) return 8;
  if (playerCount === 3 && indicator === 8) return 0;
  if (indicator < 27) {
    const base = Math.floor(indicator / 9) * 9;
    return base + ((indicator - base + 1) % 9);
  }
  if (isWind(indicator)) return EAST + ((indicator - EAST + 1) % 4);
  return WHITE + ((indicator - WHITE + 1) % 3);
}

export function tileLabel(tile: Tile | TileKind): string {
  const kind = typeof tile === 'number' ? tile : tile.kind;
  const red = typeof tile === 'number' ? false : tile.red;
  if (kind >= 27) return HONOR_LABELS[kind - 27] ?? '?';
  const suit = suitOf(kind);
  return `${red ? '赤' : ''}${rankOf(kind)}${SUIT_LABELS[suit]}`;
}

/** 内部的な牌コード（例: 1m, 0p=赤五筒, 7z=中）。 */
export function tileCode(tile: Tile): string {
  const suit = suitOf(tile.kind);
  if (suit === 'honor') return `${tile.kind - 26}z`;
  return `${tile.red ? 0 : rankOf(tile.kind)}${SUIT_CODES[suit]}`;
}

export function tileFromCode(code: string): Tile {
  const m = /^([0-9])([mpsz])$/.exec(code);
  if (!m) throw new Error(`不正な牌コード: ${code}`);
  return parseTiles(code)[0] as Tile;
}

/**
 * 「123m406p11z」形式の文字列を牌の配列に変換する（テスト・保存用）。
 * 0 は赤五、字牌は 1z=東 … 7z=中。
 */
export function parseTiles(text: string): Tile[] {
  const tiles: Tile[] = [];
  let digits: number[] = [];
  for (const ch of text.replace(/\s+/g, '')) {
    if (/[0-9]/.test(ch)) {
      digits.push(Number(ch));
      continue;
    }
    const suitIndex = 'mpsz'.indexOf(ch);
    if (suitIndex < 0 || digits.length === 0) throw new Error(`不正な牌表記: ${text}`);
    for (const d of digits) {
      if (suitIndex === 3) {
        if (d < 1 || d > 7) throw new Error(`不正な字牌: ${d}z`);
        tiles.push({ kind: 26 + d, red: false });
      } else {
        if (d === 0) tiles.push({ kind: suitIndex * 9 + 4, red: true });
        else tiles.push({ kind: suitIndex * 9 + d - 1, red: false });
      }
    }
    digits = [];
  }
  if (digits.length > 0) throw new Error(`不正な牌表記: ${text}`);
  return tiles;
}

export function tilesToCode(tiles: readonly Tile[]): string {
  return tiles.map(tileCode).join(' ');
}

export function countKinds(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  for (const t of tiles) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
  return counts;
}

/** 表示用の並び順（萬→筒→索→字、赤五は同じ位置）。 */
export function compareTiles(a: Tile, b: Tile): number {
  return a.kind - b.kind || Number(b.red) - Number(a.red);
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.kind === b.kind && a.red === b.red;
}

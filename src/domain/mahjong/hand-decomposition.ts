import type { Meld } from './hand';
import { countKinds, isUsableKind, KIND_COUNT, rankOf, YAOCHU_KINDS, type Tile, type TileKind } from './tile';

/**
 * アガリ形の判定と全分解候補の生成（仕様書 第3章）。
 * 同一手牌に複数の分解がある場合、アガリ牌の割当てごとにすべて列挙し、最初の候補だけを採用しない。
 */

export type GroupType = 'seq' | 'trip';
export type KanType = 'minkan' | 'kakan' | 'ankan';
export type WaitType = 'ryanmen' | 'kanchan' | 'penchan' | 'shanpon' | 'tanki';

export interface Group {
  readonly type: GroupType;
  /** 順子は先頭（最小）の牌種、刻子・槓子はその牌種 */
  readonly kind: TileKind;
  /** 副露による面子なら true */
  readonly fromMeld: boolean;
  /** 暗（門前で揃えた刻子、暗槓）なら true。ロンで完成した刻子は明刻扱い */
  readonly concealed: boolean;
  readonly kan?: KanType;
}

export interface StandardPattern {
  readonly form: 'standard';
  /** 4面子（副露を含む） */
  readonly groups: readonly Group[];
  readonly pair: TileKind;
  /** アガリ牌が属する手牌内の面子の添字、雀頭なら -1 */
  readonly winningGroupIndex: number;
  readonly wait: WaitType;
}

export interface ChiitoitsuPattern {
  readonly form: 'chiitoitsu';
  readonly pairs: readonly TileKind[];
  readonly wait: 'tanki';
}

export interface KokushiPattern {
  readonly form: 'kokushi';
  /** アガリ前に13種がすべて揃っていた（十三面待ち） */
  readonly thirteenWait: boolean;
  readonly pair: TileKind;
}

export type WinningPattern = StandardPattern | ChiitoitsuPattern | KokushiPattern;

export function meldToGroup(meld: Meld): Group {
  const kinds = meld.tiles.map((t) => t.kind).sort((a, b) => a - b);
  const kind = kinds[0] as TileKind;
  switch (meld.type) {
    case 'chi':
      return { type: 'seq', kind, fromMeld: true, concealed: false };
    case 'pon':
      return { type: 'trip', kind, fromMeld: true, concealed: false };
    case 'ankan':
      return { type: 'trip', kind, fromMeld: true, concealed: true, kan: 'ankan' };
    default:
      return { type: 'trip', kind, fromMeld: true, concealed: false, kan: meld.type };
  }
}

interface RawDecomposition {
  pair: TileKind;
  sets: { type: GroupType; kind: TileKind }[];
}

/** 牌種の枚数配列を「雀頭1つ＋面子 n 組」に分解する全パターン。 */
export function decomposeCounts(counts: readonly number[], setCount: number): RawDecomposition[] {
  const results: RawDecomposition[] = [];
  const work = [...counts];
  for (let p = 0; p < KIND_COUNT; p++) {
    if ((work[p] ?? 0) < 2) continue;
    work[p] = (work[p] ?? 0) - 2;
    const sets: { type: GroupType; kind: TileKind }[] = [];
    collectSets(work, 0, setCount, sets, (found) => results.push({ pair: p, sets: found }));
    work[p] = (work[p] ?? 0) + 2;
  }
  return results;
}

function collectSets(
  work: number[],
  from: number,
  remaining: number,
  sets: { type: GroupType; kind: TileKind }[],
  emit: (s: { type: GroupType; kind: TileKind }[]) => void,
): void {
  let i = from;
  while (i < KIND_COUNT && (work[i] ?? 0) === 0) i++;
  if (i >= KIND_COUNT) {
    if (remaining === 0) emit([...sets]);
    return;
  }
  if (remaining === 0) return;
  // 刻子として取る
  if ((work[i] ?? 0) >= 3) {
    work[i] = (work[i] ?? 0) - 3;
    sets.push({ type: 'trip', kind: i });
    collectSets(work, i, remaining - 1, sets, emit);
    sets.pop();
    work[i] = (work[i] ?? 0) + 3;
  }
  // 順子として取る（同じ数牌の種類内で i, i+1, i+2）
  const r = rankOf(i);
  if (r !== null && r <= 7 && (work[i + 1] ?? 0) > 0 && (work[i + 2] ?? 0) > 0) {
    work[i]! -= 1;
    work[i + 1]! -= 1;
    work[i + 2]! -= 1;
    sets.push({ type: 'seq', kind: i });
    collectSets(work, i, remaining - 1, sets, emit);
    sets.pop();
    work[i]! += 1;
    work[i + 1]! += 1;
    work[i + 2]! += 1;
  }
}

function seqWait(seqStart: TileKind, winKind: TileKind): WaitType {
  const pos = winKind - seqStart;
  const startRank = rankOf(seqStart);
  if (pos === 1) return 'kanchan';
  if (pos === 2 && startRank === 1) return 'penchan';
  if (pos === 0 && startRank === 7) return 'penchan';
  return 'ryanmen';
}

export interface DecompositionInput {
  readonly concealed: readonly Tile[];
  readonly melds: readonly Meld[];
  readonly winningTile: Tile;
  readonly method: 'ron' | 'tsumo';
}

/** アガリ形として成立するすべての候補（アガリ牌の割当てごと）。 */
export function findWinningPatterns(input: DecompositionInput): WinningPattern[] {
  const handTiles = [...input.concealed, input.winningTile];
  const counts = countKinds(handTiles);
  const winKind = input.winningTile.kind;
  const meldGroups = input.melds.map(meldToGroup);
  const setCount = 4 - input.melds.length;
  const patterns: WinningPattern[] = [];
  const seen = new Set<string>();

  if (handTiles.length === setCount * 3 + 2) {
    for (const raw of decomposeCounts(counts, setCount)) {
      // アガリ牌の割当て候補: 雀頭 / 手牌内のアガリ牌を含む各面子
      const assignments: { index: number; wait: WaitType }[] = [];
      if (raw.pair === winKind) assignments.push({ index: -1, wait: 'tanki' });
      raw.sets.forEach((s, idx) => {
        if (s.type === 'trip' && s.kind === winKind) assignments.push({ index: idx, wait: 'shanpon' });
        if (s.type === 'seq' && winKind >= s.kind && winKind <= s.kind + 2) {
          assignments.push({ index: idx, wait: seqWait(s.kind, winKind) });
        }
      });
      for (const a of assignments) {
        const handGroups: Group[] = raw.sets.map((s, idx) => ({
          type: s.type,
          kind: s.kind,
          fromMeld: false,
          // ロンで完成した刻子は明刻として扱う（仕様書 4.2 三暗刻）
          concealed: !(s.type === 'trip' && idx === a.index && input.method === 'ron'),
        }));
        const groups = [...handGroups, ...meldGroups];
        const key = `${raw.pair}|${a.wait}|${handGroups
          .map((g, i) => `${g.type}${g.kind}${i === a.index ? '*' : ''}`)
          .sort()
          .join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        patterns.push({
          form: 'standard',
          groups,
          pair: raw.pair,
          winningGroupIndex: a.index,
          wait: a.wait,
        });
      }
    }
  }

  if (input.melds.length === 0 && handTiles.length === 14) {
    const pairs = counts.flatMap((c, k) => (c === 2 ? [k] : []));
    // 同じ牌4枚を2組の対子として数えない（仕様書 3.3）
    if (pairs.length === 7) patterns.push({ form: 'chiitoitsu', pairs, wait: 'tanki' });

    const yaochuOnly = counts.every((c, k) => c === 0 || YAOCHU_KINDS.includes(k));
    const allPresent = YAOCHU_KINDS.every((k) => (counts[k] ?? 0) >= 1);
    if (yaochuOnly && allPresent) {
      const pair = YAOCHU_KINDS.find((k) => counts[k] === 2);
      if (pair !== undefined) {
        const before = countKinds(input.concealed);
        const thirteenWait = YAOCHU_KINDS.every((k) => before[k] === 1);
        patterns.push({ form: 'kokushi', thirteenWait, pair });
      }
    }
  }
  return patterns;
}

/** 手牌（13枚相当）の待ち牌を求める。形式テンパイの判定に使う。 */
export function findWaits(concealed: readonly Tile[], melds: readonly Meld[], playerCount: 3 | 4 = 4): TileKind[] {
  const waits: TileKind[] = [];
  if (concealed.length + melds.length * 3 !== 13) return waits;
  const ownCounts = countKinds([...concealed, ...melds.flatMap((m) => m.tiles)]);
  for (let k = 0; k < KIND_COUNT; k++) {
    if ((ownCounts[k] ?? 0) >= 4) continue; // 自分で4枚使っている牌は待ちにならない
    if (!isUsableKind(k, playerCount)) continue; // 3人打ちに無い牌（二萬〜八萬）は待ちにならない
    const patterns = findWinningPatterns({
      concealed,
      melds,
      winningTile: { kind: k, red: false },
      method: 'tsumo',
    });
    if (patterns.length > 0) waits.push(k);
  }
  return waits;
}

export function groupTiles(g: Group): TileKind[] {
  if (g.type === 'seq') return [g.kind, g.kind + 1, g.kind + 2];
  return [g.kind, g.kind, g.kind];
}

import type { Meld, Seat } from '../../domain/mahjong/hand';
import { validateTileCopies } from '../../domain/mahjong/hand-validation';
import { compareTiles, NORTH, rankOf, suitOf, type Tile } from '../../domain/mahjong/tile';
import type { RuleProfile } from '../../domain/rules';
import { DORA_LIMITS, emptySeat, tilesInUse, type DoraTarget, type HandDraft, type RiichiState, type SeatDraft } from '../../store/types';

/**
 * 手牌編集の純粋関数群。入力を直接変更せず、新しい下書きを返す。
 * 不正な操作（5枚目の牌など）は黙って補正せず、理由を返す。
 */

export type OpResult = { ok: true; draft: HandDraft } | { ok: false; reason: string };

const withSeat = (draft: HandDraft, seat: Seat, fn: (s: SeatDraft) => SeatDraft): HandDraft => {
  const seats = [...draft.seats] as HandDraft['seats'];
  seats[seat] = fn(draft.seats[seat]);
  return { ...draft, seats };
};

/** 卓全体の物理枚数（各牌4枚、赤はルールの枚数まで）を超えないか */
export function canAddTiles(draft: HandDraft, tiles: readonly Tile[], rules: RuleProfile): string | null {
  const errors = validateTileCopies([...tilesInUse(draft), ...tiles], rules, '卓全体');
  return errors[0]?.message ?? null;
}

/** 卓全体での残り枚数（パレット表示用） */
export function remainingCount(draft: HandDraft, tile: Tile, rules: RuleProfile): number {
  const used = tilesInUse(draft);
  const sameKind = used.filter((t) => t.kind === tile.kind).length;
  if (rankOf(tile.kind) === 5 && suitOf(tile.kind) !== 'honor') {
    const suit = suitOf(tile.kind) as 'man' | 'pin' | 'sou';
    const akaLimit = rules.dora.aka[suit];
    const redUsed = used.filter((t) => t.kind === tile.kind && t.red).length;
    const normalUsed = sameKind - redUsed;
    if (tile.red) return Math.max(0, Math.min(akaLimit - redUsed, 4 - sameKind));
    return Math.max(0, Math.min(4 - akaLimit - normalUsed, 4 - sameKind));
  }
  return Math.max(0, 4 - sameKind);
}

export const MAX_CONCEALED = 13;

export function addConcealed(draft: HandDraft, seat: Seat, tile: Tile, rules: RuleProfile, index?: number): OpResult {
  const s = draft.seats[seat];
  const max = MAX_CONCEALED - s.melds.length * 3;
  if (s.concealed.length >= max) {
    return { ok: false, reason: `手牌は${max}枚までです（アガリ牌は「アガリ牌」欄に入れてください）。` };
  }
  const err = canAddTiles(draft, [tile], rules);
  if (err) return { ok: false, reason: err };
  return {
    ok: true,
    draft: withSeat(draft, seat, (x) => {
      const concealed = [...x.concealed];
      concealed.splice(index ?? concealed.length, 0, tile);
      return { ...x, concealed };
    }),
  };
}

export function moveConcealed(draft: HandDraft, seat: Seat, from: number, to: number): HandDraft {
  return withSeat(draft, seat, (x) => {
    const concealed = [...x.concealed];
    const [t] = concealed.splice(from, 1);
    if (!t) return x;
    concealed.splice(to > from ? to - 1 : to, 0, t);
    return { ...x, concealed };
  });
}

export function removeConcealed(draft: HandDraft, seat: Seat, index: number): HandDraft {
  return withSeat(draft, seat, (x) => ({ ...x, concealed: x.concealed.filter((_, i) => i !== index) }));
}

export function sortConcealed(draft: HandDraft, seat: Seat): HandDraft {
  return withSeat(draft, seat, (x) => ({ ...x, concealed: [...x.concealed].sort(compareTiles) }));
}

export function setWinningTile(draft: HandDraft, seat: Seat, tile: Tile | null, rules: RuleProfile): OpResult {
  const cleared = withSeat(draft, seat, (x) => ({ ...x, winningTile: null }));
  if (tile) {
    const err = canAddTiles(cleared, [tile], rules);
    if (err) return { ok: false, reason: err };
  }
  return { ok: true, draft: withSeat(cleared, seat, (x) => ({ ...x, winningTile: tile })) };
}

export function addMeld(draft: HandDraft, seat: Seat, meld: Meld, rules: RuleProfile): OpResult {
  const s = draft.seats[seat];
  if (s.melds.length >= 4) return { ok: false, reason: '副露は4組までです。' };
  if (s.concealed.length > MAX_CONCEALED - (s.melds.length + 1) * 3) {
    return { ok: false, reason: '手牌の枚数が多すぎて副露を追加できません。先に手牌から牌を減らしてください。' };
  }
  if (s.riichi !== 'none' && meld.type !== 'ankan') {
    return { ok: false, reason: 'リーチ中は暗槓以外の副露はできません。先にリーチを外してください。' };
  }
  const err = canAddTiles(draft, meld.tiles, rules);
  if (err) return { ok: false, reason: err };
  return { ok: true, draft: withSeat(draft, seat, (x) => ({ ...x, melds: [...x.melds, meld] })) };
}

export function removeMeld(draft: HandDraft, seat: Seat, index: number): HandDraft {
  return withSeat(draft, seat, (x) => ({ ...x, melds: x.melds.filter((_, i) => i !== index) }));
}

/** 副露内の五を赤⇔通常に切り替える */
export function toggleMeldRed(draft: HandDraft, seat: Seat, meldIndex: number, tileIndex: number, rules: RuleProfile): OpResult {
  const meld = draft.seats[seat].melds[meldIndex];
  const t = meld?.tiles[tileIndex];
  if (!meld || !t || rankOf(t.kind) !== 5) return { ok: false, reason: '赤に切り替えられるのは五の牌だけです。' };
  const tiles = meld.tiles.map((x, i) => (i === tileIndex ? { ...x, red: !x.red } : x));
  const without = removeMeld(draft, seat, meldIndex);
  const err = canAddTiles(without, tiles, rules);
  if (err) return { ok: false, reason: err };
  return {
    ok: true,
    draft: withSeat(draft, seat, (x) => ({ ...x, melds: x.melds.map((m, i) => (i === meldIndex ? { ...m, tiles } : m)) })),
  };
}

export function setRiichi(draft: HandDraft, seat: Seat, riichi: RiichiState): OpResult {
  const s = draft.seats[seat];
  if (riichi !== 'none' && s.melds.some((m) => m.type !== 'ankan')) {
    return { ok: false, reason: '副露（暗槓以外）がある手ではリーチできません。' };
  }
  return {
    ok: true,
    draft: withSeat(draft, seat, (x) => ({ ...x, riichi, ippatsu: riichi === 'none' ? false : x.ippatsu })),
  };
}

export function setIppatsu(draft: HandDraft, seat: Seat, ippatsu: boolean): HandDraft {
  return withSeat(draft, seat, (x) => ({ ...x, ippatsu: x.riichi === 'none' ? false : ippatsu }));
}

/** 3人打ちで抜いた北の枚数を変更する（卓全体の北は4枚まで） */
export function setNuki(draft: HandDraft, seat: Seat, count: number, rules: RuleProfile): OpResult {
  if (rules.game.playerCount !== 3 || !rules.sanma.nukiDora) return { ok: false, reason: '現在のルールでは北抜きを採用していません。' };
  if (count < 0 || count > 4) return { ok: false, reason: '抜いた北は0〜4枚です。' };
  const current = draft.seats[seat].nuki;
  if (count > current) {
    const err = canAddTiles(draft, Array.from({ length: count - current }, () => ({ kind: NORTH, red: false })), rules);
    if (err) return { ok: false, reason: err };
  }
  return { ok: true, draft: withSeat(draft, seat, (x) => ({ ...x, nuki: count })) };
}

export function clearSeat(draft: HandDraft, seat: Seat): HandDraft {
  const riichi = draft.seats[seat].riichi;
  return withSeat(draft, seat, () => ({ ...emptySeat(), riichi }));
}

export function addDora(draft: HandDraft, target: DoraTarget, tile: Tile, rules: RuleProfile): OpResult {
  if (draft.dora[target].length >= DORA_LIMITS[target]) {
    return { ok: false, reason: `${target === 'dora' || target === 'ura' ? '表示牌は1枚' : '槓ドラ表示牌は4枚'}までです。` };
  }
  const err = canAddTiles(draft, [tile], rules);
  if (err) return { ok: false, reason: err };
  return { ok: true, draft: { ...draft, dora: { ...draft.dora, [target]: [...draft.dora[target], tile] } } };
}

export function removeDora(draft: HandDraft, target: DoraTarget, index: number): HandDraft {
  return { ...draft, dora: { ...draft.dora, [target]: draft.dora[target].filter((_, i) => i !== index) } };
}

/** パレットでタップした牌から副露を作る（ポン・槓は同じ牌、チーはその牌から始まる順子） */
export function buildMeld(type: Meld['type'], tile: Tile, calledFrom: Seat | undefined): Meld | string {
  if (type === 'chi') {
    const r = rankOf(tile.kind);
    if (r === null || r > 7) return 'チーは数牌の1〜7をタップしてください（タップした牌から始まる3枚になります）。';
    const tiles: Tile[] = [tile, { kind: tile.kind + 1, red: false }, { kind: tile.kind + 2, red: false }];
    return { type, tiles, ...(calledFrom !== undefined ? { calledFrom } : {}) };
  }
  const n = type === 'pon' ? 3 : 4;
  const tiles: Tile[] = Array.from({ length: n }, (_, i) => (i === 0 ? tile : { kind: tile.kind, red: false }));
  return { type, tiles, ...(type !== 'ankan' && calledFrom !== undefined ? { calledFrom } : {}) };
}

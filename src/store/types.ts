import type { Meld, Seat } from '../domain/mahjong/hand';
import type { Tile } from '../domain/mahjong/tile';
import type { GameEvent } from '../domain/round/game';
import type { RuleProfile } from '../domain/rules';

/** 牌の追加先 */
export type EditTarget = 'concealed' | 'winning' | 'meld' | 'dora' | 'kanDora' | 'ura' | 'kanUra';
export type DoraTarget = 'dora' | 'kanDora' | 'ura' | 'kanUra';

export const DORA_TARGETS: readonly DoraTarget[] = ['dora', 'kanDora', 'ura', 'kanUra'];
export const DORA_LABELS: Record<DoraTarget, string> = {
  dora: 'ドラ表示牌',
  kanDora: '槓ドラ表示牌',
  ura: '裏ドラ表示牌',
  kanUra: '槓裏ドラ表示牌',
};
export const DORA_LIMITS: Record<DoraTarget, number> = { dora: 1, kanDora: 4, ura: 1, kanUra: 4 };

export type RiichiState = 'none' | 'riichi' | 'double';

export interface SeatDraft {
  concealed: Tile[];
  melds: Meld[];
  winningTile: Tile | null;
  riichi: RiichiState;
  ippatsu: boolean;
}

export interface HandDraft {
  seats: [SeatDraft, SeatDraft, SeatDraft, SeatDraft];
  dora: Record<DoraTarget, Tile[]>;
}

export type Players = [string, string, string, string];

export interface SavedGame {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  /** 対局開始時点のルール（後から設定を変えても過去の対局は変わらない） */
  rules: RuleProfile;
  players: Players;
  events: GameEvent[];
  draft: HandDraft;
}

export const emptySeat = (): SeatDraft => ({ concealed: [], melds: [], winningTile: null, riichi: 'none', ippatsu: false });

export const emptyDraft = (): HandDraft => ({
  seats: [emptySeat(), emptySeat(), emptySeat(), emptySeat()],
  dora: { dora: [], kanDora: [], ura: [], kanUra: [] },
});

export const riichiSeats = (draft: HandDraft): Seat[] =>
  ([0, 1, 2, 3] as Seat[]).filter((s) => draft.seats[s].riichi !== 'none');

/** 卓全体で使用中の牌（物理枚数の上限チェック用） */
export function tilesInUse(draft: HandDraft): Tile[] {
  const out: Tile[] = [];
  for (const seat of draft.seats) {
    out.push(...seat.concealed, ...seat.melds.flatMap((m) => m.tiles));
    if (seat.winningTile) out.push(seat.winningTile);
  }
  out.push(...draft.dora.dora, ...draft.dora.kanDora, ...draft.dora.ura, ...draft.dora.kanUra);
  return out;
}

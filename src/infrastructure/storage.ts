import { z } from 'zod';
import { DEFAULT_RULES, ruleProfileSchema, validateRuleProfile, type RuleProfile } from '../domain/rules';
import type { SavedGame } from '../store/types';

/**
 * ローカル保存（端末内の localStorage）。通信は不要でオフラインで動作する。
 * 読み込み時はスキーマで検証し、壊れたデータはそのまま使わない。
 */

const KEY_GAMES = 'mahjong-score.games.v1';
const KEY_CURRENT = 'mahjong-score.current.v1';
const KEY_RULES = 'mahjong-score.rules.v1';

const seat = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const tile = z.object({ kind: z.number().int().min(0).max(33), red: z.boolean() });
const meld = z.object({
  type: z.enum(['chi', 'pon', 'minkan', 'kakan', 'ankan']),
  tiles: z.array(tile).min(3).max(4),
  calledFrom: seat.optional(),
});
const flags = z.object({
  riichi: z.boolean(),
  doubleRiichi: z.boolean(),
  ippatsu: z.boolean(),
  rinshan: z.boolean(),
  chankan: z.boolean(),
  chankanOnConcealedKan: z.boolean(),
  haitei: z.boolean(),
  houtei: z.boolean(),
  tenhou: z.boolean(),
  chiihou: z.boolean(),
  renhou: z.boolean(),
});
const doraSet = z.object({
  dora: z.array(tile),
  kanDora: z.array(tile),
  ura: z.array(tile),
  kanUra: z.array(tile),
});
const recordedWin = z.object({
  winner: seat,
  method: z.enum(['ron', 'tsumo']),
  discarder: seat.optional(),
  concealed: z.array(tile),
  melds: z.array(meld),
  winningTile: tile,
  flags,
  furiten: z.enum(['unknown', 'no', 'yes']),
  dora: doraSet,
  paoSeat: seat.optional(),
});
const seatList = z.array(seat);
const gameEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hand_won'), riichi: seatList, wins: z.array(recordedWin) }),
  z.object({ type: z.literal('exhaustive_draw'), riichi: seatList, tenpai: seatList, nagashi: seatList }),
  z.object({
    type: z.literal('abortive_draw'),
    kind: z.enum(['nineTerminals', 'fourWinds', 'fourRiichi', 'fourKans', 'threeRon']),
    riichi: seatList,
  }),
  z.object({ type: z.literal('chombo'), seat }),
  z.object({ type: z.literal('game_ended'), reason: z.enum(['agariYame', 'tenpaiYame', 'manual']) }),
  z.object({
    type: z.literal('state_corrected'),
    points: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
    roundWind: z.number().int(),
    kyoku: z.number().int(),
    honba: z.number().int(),
    deposits: z.number().int(),
  }),
]);
const seatDraft = z.object({
  concealed: z.array(tile),
  melds: z.array(meld),
  winningTile: tile.nullable(),
  riichi: z.enum(['none', 'riichi', 'double']),
  ippatsu: z.boolean(),
});
export const savedGameSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  rules: ruleProfileSchema,
  players: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  events: z.array(gameEvent),
  draft: z.object({ seats: z.tuple([seatDraft, seatDraft, seatDraft, seatDraft]), dora: doraSet }),
});

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export interface LoadResult<T> {
  value: T;
  /** 読み込めなかったデータがあった場合の説明 */
  warnings: string[];
}

export function loadGames(): LoadResult<SavedGame[]> {
  const raw = storage()?.getItem(KEY_GAMES);
  if (!raw) return { value: [], warnings: [] };
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error('not array');
    const games: SavedGame[] = [];
    const warnings: string[] = [];
    for (const item of list) {
      const parsed = savedGameSchema.safeParse(item);
      if (parsed.success) games.push(parsed.data as SavedGame);
      else warnings.push('読み込めない対局データが1件あったため、表示から除外しました');
    }
    return { value: games, warnings };
  } catch {
    return { value: [], warnings: ['保存データが壊れていたため読み込めませんでした'] };
  }
}

export function saveGames(games: readonly SavedGame[]): string | null {
  try {
    storage()?.setItem(KEY_GAMES, JSON.stringify(games));
    return null;
  } catch {
    return '端末への保存に失敗しました（空き容量やプライベートブラウズの設定を確認してください）';
  }
}

export function loadCurrentId(): string | null {
  return storage()?.getItem(KEY_CURRENT) ?? null;
}

export function saveCurrentId(id: string | null): void {
  try {
    if (id) storage()?.setItem(KEY_CURRENT, id);
    else storage()?.removeItem(KEY_CURRENT);
  } catch {
    /* 保存できなくても動作は継続する */
  }
}

export function loadDefaultRules(): LoadResult<RuleProfile> {
  const raw = storage()?.getItem(KEY_RULES);
  if (!raw) return { value: DEFAULT_RULES, warnings: [] };
  try {
    const result = validateRuleProfile(JSON.parse(raw));
    if (result.ok) return { value: result.rules, warnings: [] };
    return { value: DEFAULT_RULES, warnings: ['保存されたルール設定に矛盾があったため、標準ルールを使用します'] };
  } catch {
    return { value: DEFAULT_RULES, warnings: ['保存されたルール設定を読み込めませんでした'] };
  }
}

export function saveDefaultRules(rules: RuleProfile): string | null {
  try {
    storage()?.setItem(KEY_RULES, JSON.stringify(rules));
    return null;
  } catch {
    return 'ルール設定の保存に失敗しました';
  }
}

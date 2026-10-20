import { z } from 'zod';
import { defaultRulesFor, migrateRuleProfile, ruleProfileSchema, validateRuleProfile, type PlayerCount, type RuleProfile } from '../domain/rules';
import type { SavedGame } from '../store/types';

/**
 * ローカル保存（端末内の localStorage）。通信は不要でオフラインで動作する。
 * 読み込み時はスキーマで検証し、壊れたデータはそのまま使わない。
 */

const KEY_GAMES = 'mahjong-score.games.v1';
const KEY_CURRENT = 'mahjong-score.current.v1';
/** 人数ごとの「次の対局で使うルール」 */
const KEY_RULES: Record<PlayerCount, string> = { 4: 'mahjong-score.rules.v1', 3: 'mahjong-score.rules.sanma.v1' };

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
  nukiCount: z.number().int().min(0).max(4).optional(),
});
const seatList = z.array(seat);
const gameEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hand_won'), riichi: seatList, wins: z.array(recordedWin) }),
  z.object({ type: z.literal('exhaustive_draw'), riichi: seatList, tenpai: seatList, nagashi: seatList }),
  z.object({
    type: z.literal('abortive_draw'),
    kind: z.enum(['nineTerminals', 'fourWinds', 'fourRiichi', 'fourKans', 'threeRon', 'threeWinds', 'threeRiichi']),
    riichi: seatList,
  }),
  z.object({ type: z.literal('chombo'), seat }),
  z.object({ type: z.literal('game_ended'), reason: z.enum(['agariYame', 'tenpaiYame', 'manual']) }),
  z.object({
    type: z.literal('state_corrected'),
    points: z.array(z.number().int()).min(3).max(4),
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
  // 3人打ち対応前の保存データには無いため 0 を補う
  nuki: z.number().int().min(0).max(4).default(0),
});
export const savedGameSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // 古い版のルール（3人打ちの項目が無い）は読み込み時に移行する
  rules: z.preprocess(migrateRuleProfile, ruleProfileSchema),
  players: z.array(z.string()).min(3).max(4),
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
      if (parsed.success && parsed.data.players.length === parsed.data.rules.game.playerCount) {
        games.push(parsed.data as SavedGame);
        continue;
      }
      if (parsed.success) warnings.push('人数とプレイヤー数が合わない対局データが1件あったため、表示から除外しました');
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

export function loadDefaultRules(n: PlayerCount): LoadResult<RuleProfile> {
  const fallback = defaultRulesFor(n);
  const raw = storage()?.getItem(KEY_RULES[n]);
  if (!raw) return { value: fallback, warnings: [] };
  const label = `${n}人打ち`;
  try {
    const result = validateRuleProfile(migrateRuleProfile(JSON.parse(raw)));
    if (result.ok && result.rules.game.playerCount === n) return { value: result.rules, warnings: [] };
    return { value: fallback, warnings: [`保存された${label}のルール設定に矛盾があったため、標準ルールを使用します`] };
  } catch {
    return { value: fallback, warnings: [`保存された${label}のルール設定を読み込めませんでした`] };
  }
}

export function saveDefaultRules(rules: RuleProfile): string | null {
  try {
    storage()?.setItem(KEY_RULES[rules.game.playerCount], JSON.stringify(rules));
    return null;
  } catch {
    return 'ルール設定の保存に失敗しました';
  }
}

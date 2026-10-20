import type { RuleProfile } from '../rules';
import type { WinMethod } from './hand';
import type { WinningPattern } from './hand-decomposition';
import { isDragon, isYaochu, NORTH, tileLabel, type TileKind } from './tile';
import { northIsYakuhai } from './yaku';

/**
 * 符計算（仕様書 第7章）。役判定とは独立したモジュールとし、内訳を保持する。
 * 平和ツモ・七対子・副露の20符形などの特則は、加算後に個別に適用する。
 */

export interface FuItem {
  label: string;
  fu: number;
}

export interface FuResult {
  total: number;
  /** 切り上げ前の合計 */
  raw: number;
  items: FuItem[];
  /** 適用した特則の説明 */
  special?: string;
}

export interface FuContext {
  readonly pattern: WinningPattern;
  readonly menzen: boolean;
  readonly method: WinMethod;
  readonly seatWind: TileKind;
  readonly roundWind: TileKind;
  readonly isPinfu: boolean;
  readonly rules: RuleProfile;
}

const WAIT_LABEL = { kanchan: '嵌張待ち', penchan: '辺張待ち', tanki: '単騎待ち' } as const;

export function calculateFu(ctx: FuContext): FuResult {
  const { pattern } = ctx;
  if (pattern.form === 'chiitoitsu') {
    return { total: 25, raw: 25, items: [{ label: '七対子（固定）', fu: 25 }], special: '七対子は25符固定' };
  }
  if (pattern.form === 'kokushi') {
    // 役満のため点数には影響しないが、表示のために通常の符を返す
    const items: FuItem[] = [{ label: '副底', fu: 20 }];
    if (ctx.method === 'ron') items.push({ label: '門前ロン', fu: 10 });
    else items.push({ label: 'ツモ', fu: 2 });
    const raw = items.reduce((a, b) => a + b.fu, 0);
    return { total: Math.ceil(raw / 10) * 10, raw, items };
  }

  if (ctx.isPinfu && ctx.method === 'tsumo') {
    return { total: 20, raw: 20, items: [{ label: '副底', fu: 20 }], special: '平和ツモは20符（ツモ符なし）' };
  }

  const items: FuItem[] = [{ label: '副底', fu: 20 }];
  if (ctx.menzen && ctx.method === 'ron') items.push({ label: '門前ロン', fu: 10 });
  if (ctx.method === 'tsumo') items.push({ label: 'ツモ', fu: 2 });

  for (const g of pattern.groups) {
    if (g.type !== 'trip') continue;
    let fu = 2;
    if (isYaochu(g.kind)) fu *= 2;
    if (g.concealed) fu *= 2;
    if (g.kan) fu *= 4;
    const kind = g.kan ? (g.concealed ? '暗槓' : '明槓') : g.concealed ? '暗刻' : '明刻';
    items.push({ label: `${kind} ${tileLabel(g.kind)}`, fu });
  }

  const pairFu = pairFuOf(pattern.pair, ctx);
  if (pairFu > 0) items.push({ label: `雀頭 ${tileLabel(pattern.pair)}（役牌）`, fu: pairFu });

  if (pattern.wait === 'kanchan' || pattern.wait === 'penchan' || pattern.wait === 'tanki') {
    items.push({ label: WAIT_LABEL[pattern.wait], fu: 2 });
  }

  const raw = items.reduce((a, b) => a + b.fu, 0);
  if (!ctx.menzen && raw === 20) {
    return { total: 30, raw, items, special: '副露手で加符が無い形は30符' };
  }
  if (ctx.isPinfu && ctx.method === 'ron') {
    return { total: 30, raw, items, special: '平和ロンは30符' };
  }
  return { total: Math.ceil(raw / 10) * 10, raw, items };
}

function pairFuOf(pair: TileKind, ctx: FuContext): number {
  if (isDragon(pair)) return 2;
  if (pair === NORTH && northIsYakuhai(ctx.rules)) return 2;
  const seat = pair === ctx.seatWind;
  const round = pair === ctx.roundWind;
  if (seat && round) return ctx.rules.yaku.doubleWindPairFu;
  if (seat || round) return 2;
  return 0;
}

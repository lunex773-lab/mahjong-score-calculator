import type { RuleProfile } from '../rules';
import type { WinFlags, WinMethod } from './hand';
import { groupTiles, type Group, type StandardPattern, type WinningPattern } from './hand-decomposition';
import {
  DRAGONS,
  GREEN,
  isDragon,
  isHonor,
  isSimple,
  isTerminal,
  isWind,
  isYaochu,
  KIND_COUNT,
  rankOf,
  suitOf,
  WINDS,
  type TileKind,
} from './tile';

/**
 * 役の定義と判定（仕様書 第4章・第5章）。
 * 各役は ID・表示名・門前翻数・副露翻数・排他関係をデータとして持ち、判定関数は役ごとに独立させる。
 * 役満は通常役と別の定義表で判定し、翻数計算に混ぜない。
 */

export interface YakuContext {
  readonly pattern: WinningPattern;
  /** 暗槓以外の副露が無い */
  readonly menzen: boolean;
  readonly method: WinMethod;
  readonly flags: WinFlags;
  readonly seatWind: TileKind;
  readonly roundWind: TileKind;
  readonly rules: RuleProfile;
  readonly winningKind: TileKind;
  /** アガリ牌を除く手牌（副露を除く）の牌種別枚数 */
  readonly concealedCounts: readonly number[];
  /** 副露・アガリ牌を含む全牌の牌種別枚数（槓子は4枚） */
  readonly allCounts: readonly number[];
  readonly kanCount: number;
}

export type YakuId =
  | 'riichi'
  | 'double-riichi'
  | 'ippatsu'
  | 'menzen-tsumo'
  | 'tanyao'
  | 'pinfu'
  | 'iipeikou'
  | 'yakuhai-white'
  | 'yakuhai-green'
  | 'yakuhai-red'
  | 'yakuhai-seat-wind'
  | 'yakuhai-round-wind'
  | 'rinshan'
  | 'chankan'
  | 'haitei'
  | 'houtei'
  | 'chiitoitsu'
  | 'toitoi'
  | 'sanshoku'
  | 'ittsu'
  | 'chanta'
  | 'sanshoku-doukou'
  | 'sanankou'
  | 'sankantsu'
  | 'shousangen'
  | 'honroutou'
  | 'ryanpeikou'
  | 'junchan'
  | 'honitsu'
  | 'chinitsu'
  | 'renhou-mangan';

export interface YakuDefinition {
  readonly id: YakuId;
  readonly name: string;
  readonly closedHan: number;
  /** 副露時の翻数。null は門前限定 */
  readonly openHan: number | null;
  /** この役が成立すると無効になる役（上位役・排他関係） */
  readonly supersedes?: readonly YakuId[];
  readonly judge: (ctx: YakuContext) => boolean;
}

export type YakumanId =
  | 'kokushi'
  | 'suuankou'
  | 'daisangen'
  | 'shousuushii'
  | 'daisuushii'
  | 'tsuuiisou'
  | 'ryuuiisou'
  | 'chinroutou'
  | 'suukantsu'
  | 'chuuren'
  | 'tenhou'
  | 'chiihou'
  | 'renhou';

export interface YakumanDefinition {
  readonly id: YakumanId;
  readonly name: string;
  /** 包（責任払い）の対象になり得るか */
  readonly paoRule?: keyof RuleProfile['pao'];
  readonly supersedes?: readonly YakumanId[];
  /** 不成立なら 0、成立なら役満単位（1 または 2） */
  readonly judge: (ctx: YakuContext) => number;
}

export interface YakuResult {
  id: YakuId;
  name: string;
  han: number;
}

export interface YakumanResult {
  yakuId: YakumanId;
  name: string;
  units: number;
  reason: string;
}

/* ---------- 判定補助 ---------- */

const std = (ctx: YakuContext): StandardPattern | null => (ctx.pattern.form === 'standard' ? ctx.pattern : null);

const kindsPresent = (ctx: YakuContext): TileKind[] => {
  const out: TileKind[] = [];
  for (let k = 0; k < KIND_COUNT; k++) if ((ctx.allCounts[k] ?? 0) > 0) out.push(k);
  return out;
};

const trips = (p: StandardPattern): Group[] => p.groups.filter((g) => g.type === 'trip');
const seqs = (p: StandardPattern): Group[] => p.groups.filter((g) => g.type === 'seq');
const hasTripOf = (p: StandardPattern, kind: TileKind): boolean => trips(p).some((g) => g.kind === kind);

const isYakuhaiKind = (ctx: YakuContext, kind: TileKind): boolean =>
  isDragon(kind) || kind === ctx.seatWind || kind === ctx.roundWind;

/** 同一順子の組数（一盃口=1, 二盃口=2） */
function identicalSeqPairs(p: StandardPattern): number {
  const counts = new Map<TileKind, number>();
  for (const g of seqs(p)) {
    if (g.fromMeld) continue;
    counts.set(g.kind, (counts.get(g.kind) ?? 0) + 1);
  }
  let pairs = 0;
  for (const c of counts.values()) pairs += Math.floor(c / 2);
  return pairs;
}

function everyBlock(p: StandardPattern, test: (kinds: TileKind[]) => boolean): boolean {
  return p.groups.every((g) => test(groupTiles(g))) && test([p.pair, p.pair]);
}

function suitsUsed(ctx: YakuContext): { numberSuits: Set<string>; hasHonor: boolean } {
  const numberSuits = new Set<string>();
  let hasHonor = false;
  for (const k of kindsPresent(ctx)) {
    if (isHonor(k)) hasHonor = true;
    else numberSuits.add(suitOf(k));
  }
  return { numberSuits, hasHonor };
}

const concealedTripCount = (p: StandardPattern): number => trips(p).filter((g) => g.concealed).length;

/* ---------- 通常役 ---------- */

export const YAKU_DEFINITIONS: readonly YakuDefinition[] = [
  {
    id: 'riichi',
    name: '立直',
    closedHan: 1,
    openHan: null,
    judge: (c) => c.flags.riichi && !c.flags.doubleRiichi,
  },
  { id: 'double-riichi', name: 'ダブル立直', closedHan: 2, openHan: null, supersedes: ['riichi'], judge: (c) => c.flags.doubleRiichi },
  { id: 'ippatsu', name: '一発', closedHan: 1, openHan: null, judge: (c) => c.flags.ippatsu && (c.flags.riichi || c.flags.doubleRiichi) },
  { id: 'menzen-tsumo', name: '門前清自摸和', closedHan: 1, openHan: null, judge: (c) => c.method === 'tsumo' },
  {
    id: 'tanyao',
    name: '断么九',
    closedHan: 1,
    openHan: 1,
    judge: (c) => (c.menzen || c.rules.yaku.openTanyao) && kindsPresent(c).every(isSimple),
  },
  {
    id: 'pinfu',
    name: '平和',
    closedHan: 1,
    openHan: null,
    judge: (c) => {
      const p = std(c);
      return (
        p !== null &&
        p.groups.every((g) => g.type === 'seq' && !g.fromMeld) &&
        !isYakuhaiKind(c, p.pair) &&
        p.wait === 'ryanmen'
      );
    },
  },
  {
    id: 'iipeikou',
    name: '一盃口',
    closedHan: 1,
    openHan: null,
    judge: (c) => {
      const p = std(c);
      return p !== null && identicalSeqPairs(p) === 1;
    },
  },
  { id: 'yakuhai-white', name: '役牌 白', closedHan: 1, openHan: 1, judge: (c) => !!std(c) && hasTripOf(std(c)!, DRAGONS[0]) },
  { id: 'yakuhai-green', name: '役牌 發', closedHan: 1, openHan: 1, judge: (c) => !!std(c) && hasTripOf(std(c)!, DRAGONS[1]) },
  { id: 'yakuhai-red', name: '役牌 中', closedHan: 1, openHan: 1, judge: (c) => !!std(c) && hasTripOf(std(c)!, DRAGONS[2]) },
  { id: 'yakuhai-seat-wind', name: '自風牌', closedHan: 1, openHan: 1, judge: (c) => !!std(c) && hasTripOf(std(c)!, c.seatWind) },
  { id: 'yakuhai-round-wind', name: '場風牌', closedHan: 1, openHan: 1, judge: (c) => !!std(c) && hasTripOf(std(c)!, c.roundWind) },
  { id: 'rinshan', name: '嶺上開花', closedHan: 1, openHan: 1, judge: (c) => c.flags.rinshan },
  { id: 'chankan', name: '槍槓', closedHan: 1, openHan: 1, judge: (c) => c.flags.chankan },
  { id: 'haitei', name: '海底摸月', closedHan: 1, openHan: 1, judge: (c) => c.flags.haitei },
  { id: 'houtei', name: '河底撈魚', closedHan: 1, openHan: 1, judge: (c) => c.flags.houtei },
  { id: 'chiitoitsu', name: '七対子', closedHan: 2, openHan: null, judge: (c) => c.pattern.form === 'chiitoitsu' },
  {
    id: 'toitoi',
    name: '対々和',
    closedHan: 2,
    openHan: 2,
    judge: (c) => {
      const p = std(c);
      return p !== null && p.groups.every((g) => g.type === 'trip');
    },
  },
  {
    id: 'sanshoku',
    name: '三色同順',
    closedHan: 2,
    openHan: 1,
    judge: (c) => {
      const p = std(c);
      if (!p) return false;
      return [1, 2, 3, 4, 5, 6, 7].some((r) =>
        (['man', 'pin', 'sou'] as const).every((s) => seqs(p).some((g) => suitOf(g.kind) === s && rankOf(g.kind) === r)),
      );
    },
  },
  {
    id: 'ittsu',
    name: '一気通貫',
    closedHan: 2,
    openHan: 1,
    judge: (c) => {
      const p = std(c);
      if (!p) return false;
      return (['man', 'pin', 'sou'] as const).some((s) =>
        [1, 4, 7].every((r) => seqs(p).some((g) => suitOf(g.kind) === s && rankOf(g.kind) === r)),
      );
    },
  },
  {
    id: 'chanta',
    name: '混全帯么九',
    closedHan: 2,
    openHan: 1,
    judge: (c) => {
      const p = std(c);
      return (
        p !== null &&
        seqs(p).length > 0 &&
        everyBlock(p, (ks) => ks.some(isYaochu)) &&
        kindsPresent(c).some(isHonor)
      );
    },
  },
  {
    id: 'sanshoku-doukou',
    name: '三色同刻',
    closedHan: 2,
    openHan: 2,
    judge: (c) => {
      const p = std(c);
      if (!p) return false;
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].some((r) =>
        (['man', 'pin', 'sou'] as const).every((s) => trips(p).some((g) => suitOf(g.kind) === s && rankOf(g.kind) === r)),
      );
    },
  },
  {
    id: 'sanankou',
    name: '三暗刻',
    closedHan: 2,
    openHan: 2,
    judge: (c) => {
      const p = std(c);
      return p !== null && concealedTripCount(p) === 3;
    },
  },
  { id: 'sankantsu', name: '三槓子', closedHan: 2, openHan: 2, judge: (c) => c.kanCount === 3 },
  {
    id: 'shousangen',
    name: '小三元',
    closedHan: 2,
    openHan: 2,
    judge: (c) => {
      const p = std(c);
      return p !== null && isDragon(p.pair) && DRAGONS.filter((d) => hasTripOf(p, d)).length === 2;
    },
  },
  {
    id: 'honroutou',
    name: '混老頭',
    closedHan: 2,
    openHan: 2,
    judge: (c) => {
      const ks = kindsPresent(c);
      return ks.every(isYaochu) && ks.some(isHonor) && ks.some(isTerminal);
    },
  },
  {
    id: 'ryanpeikou',
    name: '二盃口',
    closedHan: 3,
    openHan: null,
    supersedes: ['iipeikou'],
    judge: (c) => {
      const p = std(c);
      return p !== null && identicalSeqPairs(p) === 2;
    },
  },
  {
    id: 'junchan',
    name: '純全帯么九',
    closedHan: 3,
    openHan: 2,
    supersedes: ['chanta'],
    judge: (c) => {
      const p = std(c);
      return p !== null && seqs(p).length > 0 && everyBlock(p, (ks) => ks.some(isTerminal));
    },
  },
  {
    id: 'honitsu',
    name: '混一色',
    closedHan: 3,
    openHan: 2,
    judge: (c) => {
      const { numberSuits, hasHonor } = suitsUsed(c);
      return numberSuits.size === 1 && hasHonor;
    },
  },
  {
    id: 'chinitsu',
    name: '清一色',
    closedHan: 6,
    openHan: 5,
    supersedes: ['honitsu'],
    judge: (c) => {
      const { numberSuits, hasHonor } = suitsUsed(c);
      return numberSuits.size === 1 && !hasHonor;
    },
  },
];

/* ---------- 役満 ---------- */

const CHUUREN_BASE = [3, 1, 1, 1, 1, 1, 1, 1, 3];
const GREEN_KINDS: readonly TileKind[] = [19, 20, 21, 23, 25, GREEN]; // 2s 3s 4s 6s 8s 發

function chuurenUnits(c: YakuContext): number {
  if (!c.menzen || c.kanCount > 0 || c.pattern.form !== 'standard') return 0;
  const present = kindsPresent(c);
  const suit = suitOf(present[0] ?? 27);
  if (suit === 'honor' || present.some((k) => suitOf(k) !== suit)) return 0;
  const base = present[0]! - (rankOf(present[0]!)! - 1);
  const ok = CHUUREN_BASE.every((need, i) => (c.allCounts[base + i] ?? 0) >= need);
  if (!ok) return 0;
  const nineWait = CHUUREN_BASE.every((need, i) => c.concealedCounts[base + i] === need);
  return nineWait && c.rules.yaku.doubleYakuman.chuuren9 ? 2 : 1;
}

export const YAKUMAN_DEFINITIONS: readonly YakumanDefinition[] = [
  {
    id: 'kokushi',
    name: '国士無双',
    judge: (c) => {
      if (c.pattern.form !== 'kokushi') return 0;
      return c.pattern.thirteenWait && c.rules.yaku.doubleYakuman.kokushi13 ? 2 : 1;
    },
  },
  {
    id: 'suuankou',
    name: '四暗刻',
    judge: (c) => {
      const p = std(c);
      if (!p || concealedTripCount(p) !== 4) return 0;
      return p.wait === 'tanki' && c.rules.yaku.doubleYakuman.suuankouTanki ? 2 : 1;
    },
  },
  {
    id: 'daisangen',
    name: '大三元',
    paoRule: 'daisangen',
    judge: (c) => {
      const p = std(c);
      return p && DRAGONS.every((d) => hasTripOf(p, d)) ? 1 : 0;
    },
  },
  {
    id: 'shousuushii',
    name: '小四喜',
    judge: (c) => {
      const p = std(c);
      return p && isWind(p.pair) && WINDS.filter((w) => hasTripOf(p, w)).length === 3 ? 1 : 0;
    },
  },
  {
    id: 'daisuushii',
    name: '大四喜',
    paoRule: 'daisuushii',
    supersedes: ['shousuushii'],
    judge: (c) => {
      const p = std(c);
      if (!p || !WINDS.every((w) => hasTripOf(p, w))) return 0;
      return c.rules.yaku.doubleYakuman.daisuushii ? 2 : 1;
    },
  },
  { id: 'tsuuiisou', name: '字一色', judge: (c) => (kindsPresent(c).every(isHonor) ? 1 : 0) },
  {
    id: 'ryuuiisou',
    name: '緑一色',
    judge: (c) => {
      const ks = kindsPresent(c);
      if (!ks.every((k) => GREEN_KINDS.includes(k))) return 0;
      if (c.rules.yaku.ryuuiisouRequiresHatsu && !ks.includes(GREEN)) return 0;
      return 1;
    },
  },
  { id: 'chinroutou', name: '清老頭', judge: (c) => (kindsPresent(c).every(isTerminal) ? 1 : 0) },
  { id: 'suukantsu', name: '四槓子', paoRule: 'suukantsu', judge: (c) => (c.kanCount === 4 ? 1 : 0) },
  { id: 'chuuren', name: '九蓮宝燈', judge: chuurenUnits },
  { id: 'tenhou', name: '天和', judge: (c) => (c.flags.tenhou ? 1 : 0) },
  { id: 'chiihou', name: '地和', judge: (c) => (c.flags.chiihou ? 1 : 0) },
  { id: 'renhou', name: '人和', judge: (c) => (c.flags.renhou && c.rules.yaku.renhou === 'yakuman' ? 1 : 0) },
];

/** 通常役を判定し、排他関係（上位役）を適用する。 */
export function judgeYaku(ctx: YakuContext): YakuResult[] {
  const found = YAKU_DEFINITIONS.filter((def) => {
    if (!ctx.menzen && def.openHan === null) return false;
    return def.judge(ctx);
  });
  const superseded = new Set(found.flatMap((d) => d.supersedes ?? []));
  return found
    .filter((d) => !superseded.has(d.id))
    .map((d) => ({ id: d.id, name: d.name, han: ctx.menzen ? d.closedHan : (d.openHan as number) }));
}

const DOUBLE_REASONS: Partial<Record<YakumanId, string>> = {
  kokushi: '十三面待ち',
  suuankou: '単騎待ち',
  daisuushii: 'ダブル役満設定',
  chuuren: '九面待ち',
};

/** 役満を判定する。複合方式（single/multiple）は呼び出し側ではなくここで適用する。 */
export function judgeYakuman(ctx: YakuContext): YakumanResult[] {
  const found: YakumanResult[] = [];
  for (const def of YAKUMAN_DEFINITIONS) {
    const units = def.judge(ctx);
    if (units <= 0) continue;
    found.push({
      yakuId: def.id,
      name: units >= 2 ? `${def.name}（ダブル役満）` : def.name,
      units,
      reason: units >= 2 ? (DOUBLE_REASONS[def.id] ?? 'ダブル役満') : '役満',
    });
  }
  const superseded = new Set(
    YAKUMAN_DEFINITIONS.filter((d) => found.some((f) => f.yakuId === d.id)).flatMap((d) => d.supersedes ?? []),
  );
  const result = found.filter((f) => !superseded.has(f.yakuId));
  if (ctx.rules.yaku.yakumanStacking === 'single' && result.length > 1) {
    // 複合しない設定: 最も単位の大きい1つだけを残す
    const best = result.reduce((a, b) => (b.units > a.units ? b : a));
    return [best];
  }
  return result;
}

export function yakumanPaoRule(id: YakumanId): keyof RuleProfile['pao'] | undefined {
  return YAKUMAN_DEFINITIONS.find((d) => d.id === id)?.paoRule;
}

import type { RuleProfile } from '../rules';

/** 基本点と満貫以上の区分（仕様書 第8章）。 */

export type LimitType = 'mangan' | 'haneman' | 'baiman' | 'sanbaiman' | 'yakuman' | 'kazoe-yakuman';

export const LIMIT_LABELS: Record<LimitType, string> = {
  mangan: '満貫',
  haneman: '跳満',
  baiman: '倍満',
  sanbaiman: '三倍満',
  yakuman: '役満',
  'kazoe-yakuman': '数え役満',
};

export const YAKUMAN_BASE = 8000;

export interface BasePoints {
  base: number;
  limit: LimitType | null;
}

/** 通常役の翻数・符から基本点を求める。基本点 = 符 × 2^(翻+2)、満貫以上は段階制。 */
export function basePointsFor(han: number, fu: number, rules: RuleProfile): BasePoints {
  if (han >= 13) {
    if (rules.yaku.kazoeYakuman === 'yakuman') return { base: YAKUMAN_BASE, limit: 'kazoe-yakuman' };
    return { base: 6000, limit: 'sanbaiman' };
  }
  if (han >= 11) return { base: 6000, limit: 'sanbaiman' };
  if (han >= 8) return { base: 4000, limit: 'baiman' };
  if (han >= 6) return { base: 3000, limit: 'haneman' };
  if (han >= 5) return { base: 2000, limit: 'mangan' };
  const raw = fu * 2 ** (han + 2);
  if (raw >= 2000) return { base: 2000, limit: 'mangan' };
  if (rules.yaku.kiriageMangan && raw === 1920) return { base: 2000, limit: 'mangan' };
  return { base: raw, limit: null };
}

export function yakumanBasePoints(units: number): BasePoints {
  return { base: YAKUMAN_BASE * units, limit: 'yakuman' };
}

/** 支払額の端数処理: 100点未満切り上げ */
export const roundUp100 = (x: number): number => Math.ceil(x / 100) * 100;

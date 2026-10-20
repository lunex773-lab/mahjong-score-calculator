import { describe, expect, it } from 'vitest';
import type { WinInput } from '../../src/domain/mahjong/hand';
import { calculateHandScore } from '../../src/domain/mahjong/scoring';
import { DEFAULT_RULES } from '../../src/domain/rules';
import cases from '../fixtures/differential-cases.json';

/*
 * 独立実装（Python「mahjong」ライブラリ 1.2.1）で計算した期待値との照合。
 * 期待値は tests/differential/compare.py --emit で生成した（AI が手で書いた値ではない）。
 * ライブラリの仕様に合わせ、連風牌の雀頭は4符として比較する。
 */
const rules = structuredClone(DEFAULT_RULES);
rules.yaku.doubleWindPairFu = 4;

interface Case {
  input: WinInput;
  expected: { valid: boolean; total: number; han: number; fu: number };
}

describe('独立実装との照合（固定600手）', () => {
  it.each((cases as Case[]).map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    const r = calculateHandScore(c.input, rules);
    expect(r.valid).toBe(c.expected.valid);
    if (!c.expected.valid) {
      expect(r.errors[0]?.code).toBe('NO_YAKU');
      return;
    }
    expect(r.winnerTotal).toBe(c.expected.total);
    if (r.yakuman.length === 0) {
      expect(r.han.totalHan).toBe(c.expected.han);
      if (c.expected.han < 5) expect(r.fu.total).toBe(c.expected.fu);
    }
  });
});

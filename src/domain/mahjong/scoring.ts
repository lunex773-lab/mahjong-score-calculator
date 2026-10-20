import { internalError, userError, type RuleError, type RuleWarning } from '../errors';
import type { RuleProfile } from '../rules';
import { calculateFu, type FuItem, type FuResult } from './fu';
import { allHandTiles, isKanMeld, seatWindOf, type WinInput } from './hand';
import { findWinningPatterns, type WinningPattern } from './hand-decomposition';
import { validateWinInput } from './hand-validation';
import { countDora, type DoraItem } from './dora';
import { computeWinPayments, ronAmount, sumPayments, tsumoAmounts, type PaymentResult } from './payment';
import { basePointsFor, yakumanBasePoints, type LimitType, YAKUMAN_BASE } from './score';
import { countKinds, isDragon, isWind } from './tile';
import { judgeYaku, judgeYakuman, yakumanPaoRule, type YakuContext, type YakuResult, type YakumanResult } from './yaku';

/**
 * アガリ1件の採点パイプライン（仕様書 1.1 の手順 1〜14）。
 * 入力検証 → 全分解候補 → 候補ごとに役・符・点数 → 最高点の合法候補を選択 → 支払い。
 * 無効な入力に対して仮の点数を返さない。
 */

export interface PatternScore {
  pattern: WinningPattern;
  yaku: YakuResult[];
  yakuman: YakumanResult[];
  han: { ordinaryHan: number; doraHan: number; totalHan: number };
  fu: FuResult;
  limit: LimitType | null;
  basePoints: number;
  /** 包の対象となる役満の単位数 */
  paoUnits: number;
  /** アガリ者が基本点で受け取る合計（本場・供託を除く） */
  handTotal: number;
}

export interface ScoringResult {
  valid: boolean;
  errors: RuleError[];
  warnings: RuleWarning[];
  winningPatterns: WinningPattern[];
  selectedPattern?: WinningPattern;
  yaku: YakuResult[];
  yakuman: YakumanResult[];
  dora: DoraItem[];
  han: { ordinaryHan: number; doraHan: number; totalHan: number };
  fu: { total: number; items: FuItem[]; special?: string };
  limit: LimitType | null;
  basePoints: number;
  payments: PaymentResult[];
  honbaPayments: PaymentResult[];
  depositTransfer: PaymentResult | null;
  riichiStickTransfer: number;
  /** アガリ者の受取合計（基本点＋本場＋供託） */
  winnerTotal: number;
  isDealer: boolean;
  ruleProfileId: string;
  ruleProfileVersion: string;
}

function emptyResult(rules: RuleProfile, errors: RuleError[], warnings: RuleWarning[] = []): ScoringResult {
  return {
    valid: false,
    errors,
    warnings,
    winningPatterns: [],
    yaku: [],
    yakuman: [],
    dora: [],
    han: { ordinaryHan: 0, doraHan: 0, totalHan: 0 },
    fu: { total: 0, items: [] },
    limit: null,
    basePoints: 0,
    payments: [],
    honbaPayments: [],
    depositTransfer: null,
    riichiStickTransfer: 0,
    winnerTotal: 0,
    isDealer: false,
    ruleProfileId: rules.id,
    ruleProfileVersion: rules.version,
  };
}

/** アガリ者が基本点で受け取る合計（候補の比較用。支払い計算と同じ関数で求める） */
function handTotalFor(base: number, input: WinInput, rules: RuleProfile): number {
  if (input.method === 'ron') return ronAmount(base, input.winner === input.dealer);
  let total = 0;
  for (const amount of tsumoAmounts(base, input.winner, input.dealer, rules).values()) total += amount;
  return total;
}

export function calculateHandScore(input: WinInput, rules: RuleProfile): ScoringResult {
  const warnings: RuleWarning[] = [];
  const errors = validateWinInput(input, rules);
  if (errors.length > 0) return emptyResult(rules, errors);

  const patterns = findWinningPatterns(input);
  if (patterns.length === 0) {
    return emptyResult(rules, [
      userError(
        'INVALID_HAND_STRUCTURE',
        'アガリ形になっていません。手牌・副露・アガリ牌を確認してください（4面子1雀頭・七対子・国士無双のいずれか）。',
        'concealed',
      ),
    ]);
  }

  const menzen = input.melds.every((m) => m.type === 'ankan');
  const seatWind = seatWindOf(input.winner, input.dealer, rules.game.playerCount);
  const isDealer = input.winner === input.dealer;
  const riichi = input.flags.riichi || input.flags.doubleRiichi;
  const handTiles = allHandTiles(input);
  const allCounts = countKinds(handTiles);
  const concealedCounts = countKinds(input.concealed);
  const kanCount = input.melds.filter(isKanMeld).length;
  const dora = countDora(handTiles, input.dora, rules, riichi, input.nukiCount ?? 0);
  const doraHanTotal = dora.reduce((a, d) => a + d.count, 0);

  const scored: PatternScore[] = [];
  for (const pattern of patterns) {
    if (input.flags.chankanOnConcealedKan && pattern.form !== 'kokushi') continue;
    const ctx: YakuContext = {
      pattern,
      menzen,
      method: input.method,
      flags: input.flags,
      seatWind,
      roundWind: input.roundWind,
      rules,
      winningKind: input.winningTile.kind,
      concealedCounts,
      allCounts,
      kanCount,
    };
    const yakuman = judgeYakuman(ctx);
    const yaku = yakuman.length > 0 ? [] : judgeYaku(ctx);
    const isPinfu = yaku.some((y) => y.id === 'pinfu');
    const fu = calculateFu({ pattern, menzen, method: input.method, seatWind, roundWind: input.roundWind, isPinfu, rules });

    if (yakuman.length > 0) {
      const units = yakuman.reduce((a, y) => a + y.units, 0);
      const paoUnits = yakuman
        .filter((y) => {
          const rule = yakumanPaoRule(y.yakuId);
          return rule !== undefined && rules.pao[rule];
        })
        .reduce((a, y) => a + y.units, 0);
      const { base, limit } = yakumanBasePoints(units);
      scored.push({
        pattern,
        yaku: [],
        yakuman,
        han: { ordinaryHan: 0, doraHan: 0, totalHan: 0 },
        fu,
        limit,
        basePoints: base,
        paoUnits,
        handTotal: handTotalFor(base, input, rules),
      });
      continue;
    }

    if (yaku.length > 0) {
      const ordinaryHan = yaku.reduce((a, y) => a + y.han, 0);
      const totalHan = ordinaryHan + doraHanTotal;
      const { base, limit } = basePointsFor(totalHan, fu.total, rules);
      scored.push({
        pattern,
        yaku,
        yakuman: [],
        han: { ordinaryHan, doraHan: doraHanTotal, totalHan },
        fu,
        limit,
        basePoints: base,
        paoUnits: 0,
        handTotal: handTotalFor(base, input, rules),
      });
    }

    // 人和を満貫として扱う設定: 他の役と複合させず、高い方を採用する
    if (input.flags.renhou && rules.yaku.renhou === 'mangan') {
      scored.push({
        pattern,
        yaku: [{ id: 'renhou-mangan', name: '人和（満貫）', han: 0 }],
        yakuman: [],
        han: { ordinaryHan: 0, doraHan: 0, totalHan: 0 },
        fu,
        limit: 'mangan',
        basePoints: 2000,
        paoUnits: 0,
        handTotal: handTotalFor(2000, input, rules),
      });
    }
  }

  if (scored.length === 0) {
    if (input.flags.chankanOnConcealedKan) {
      return emptyResult(rules, [
        userError('INVALID_WIN_CONTEXT', '暗槓に対する槍槓は国士無双のときだけ認められます。', 'chankan'),
      ]);
    }
    return emptyResult(rules, [
      userError('NO_YAKU', '役がありません。ドラだけではアガれません（リーチ・ツモなどの条件も確認してください）。'),
    ]);
  }

  // 最高点法: アガリ者の受取が最大の候補、同点なら翻数・符の大きい候補
  const best = scored.reduce((a, b) => {
    if (b.handTotal !== a.handTotal) return b.handTotal > a.handTotal ? b : a;
    if (b.han.totalHan !== a.han.totalHan) return b.han.totalHan > a.han.totalHan ? b : a;
    return b.fu.total > a.fu.total ? b : a;
  });

  // 包の検証と適用
  let paoBase = 0;
  if (input.paoSeat !== undefined) {
    const paoError = validatePao(input, best);
    if (paoError) return emptyResult(rules, [paoError]);
    paoBase = YAKUMAN_BASE * best.paoUnits;
  }

  if (input.method === 'ron' && input.furiten === 'unknown') {
    warnings.push({
      code: 'FURITEN_UNCONFIRMED',
      message: 'フリテン判定は未確認です。アガった人の捨て牌にアガリ牌が無いこと（見逃しが無いこと）を確認してください。',
    });
  }

  const { payments, honbaPayments, depositTransfer } = computeWinPayments({
    winner: input.winner,
    dealer: input.dealer,
    method: input.method,
    ...(input.discarder !== undefined ? { discarder: input.discarder } : {}),
    base: best.basePoints - paoBase,
    paoBase,
    ...(input.paoSeat !== undefined ? { paoSeat: input.paoSeat } : {}),
    honba: input.honba,
    riichiSticks: input.riichiSticks,
    rules,
  });

  const handPaid = sumPayments(payments);
  if (handPaid !== best.handTotal) {
    return emptyResult(rules, [
      internalError('POINT_CONSERVATION_FAILED', `支払い合計（${handPaid}）と受取額（${best.handTotal}）が一致しません。`),
    ]);
  }
  const depositAmount = depositTransfer?.amount ?? 0;

  return {
    valid: true,
    errors: [],
    warnings,
    winningPatterns: patterns,
    selectedPattern: best.pattern,
    yaku: best.yaku,
    yakuman: best.yakuman,
    dora,
    han: best.han,
    fu: { total: best.fu.total, items: best.fu.items, ...(best.fu.special ? { special: best.fu.special } : {}) },
    limit: best.limit,
    basePoints: best.basePoints,
    payments,
    honbaPayments,
    depositTransfer,
    riichiStickTransfer: depositAmount,
    winnerTotal: handPaid + sumPayments(honbaPayments) + depositAmount,
    isDealer,
    ruleProfileId: rules.id,
    ruleProfileVersion: rules.version,
  };
}

function validatePao(input: WinInput, best: PatternScore): RuleError | null {
  if (best.paoUnits === 0) {
    return userError(
      'INVALID_RESPONSIBILITY_PAYMENT',
      '包（責任払い）は、現在のルールで対象となる役満（大三元・大四喜など）が成立したときだけ設定できます。',
      'pao',
    );
  }
  const relevant = input.melds.filter((m) => {
    if (m.calledFrom !== input.paoSeat) return false;
    const kind = m.tiles[0]?.kind ?? -1;
    return best.yakuman.some(
      (y) =>
        (y.yakuId === 'daisangen' && isDragon(kind)) ||
        (y.yakuId === 'daisuushii' && isWind(kind)) ||
        (y.yakuId === 'suukantsu' && isKanMeld(m)),
    );
  });
  if (relevant.length === 0) {
    return userError(
      'INVALID_RESPONSIBILITY_PAYMENT',
      '包の責任者は、役満の確定に必要な牌（三元牌・風牌など）を鳴かせた人を選んでください。',
      'pao',
    );
  }
  return null;
}


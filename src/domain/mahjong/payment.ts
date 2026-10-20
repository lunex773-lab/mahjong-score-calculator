import type { RuleProfile } from '../rules';
import { seatsOf, type Seat, type WinMethod } from './hand';
import { roundUp100 } from './score';

/**
 * 支払い計算（仕様書 8.3〜8.5・第13章）。
 * 基本点による支払い・本場・供託・包を別々の明細として保持し、混在させない。
 */

export type PaymentKind = 'hand' | 'honba' | 'deposit' | 'pao';

export interface PaymentResult {
  /** 'pot' は供託（場に出ているリーチ棒） */
  from: Seat | 'pot';
  to: Seat;
  amount: number;
  kind: PaymentKind;
}

export interface WinPaymentInput {
  winner: Seat;
  dealer: Seat;
  method: WinMethod;
  discarder?: Seat;
  /** 包の対象外部分の基本点 */
  base: number;
  /** 包の対象となる役満部分の基本点（包が無ければ 0） */
  paoBase: number;
  paoSeat?: Seat;
  honba: number;
  riichiSticks: number;
  rules: RuleProfile;
}

export interface WinPayments {
  payments: PaymentResult[];
  honbaPayments: PaymentResult[];
  depositTransfer: PaymentResult | null;
}

const others = (seat: Seat, playerCount: 3 | 4): Seat[] => seatsOf(playerCount).filter((s) => s !== seat);

/** ロン時に放銃者1人が支払う額 */
export function ronAmount(base: number, winnerIsDealer: boolean): number {
  return roundUp100(base * (winnerIsDealer ? 6 : 4));
}

/**
 * ツモ時に各支払者が支払う額。
 * 4人打ち: 親のツモは各自 基本点×2、子のツモは親 ×2・子 ×1。
 * 3人打ち（北家がいない）:
 *   split = 北家が払うはずの分を残る2人で折半（親のツモは各自 ×3、子のツモは親 ×2.5・子 ×1.5）
 *   loss  = 4人打ちと同じ額を2人が払い、北家の分は払われない（ツモ損）
 * 端数は各支払額の最後に1回だけ100点単位へ切り上げる（同じ金額を二重に丸めない）。
 */
export function tsumoAmounts(base: number, winner: Seat, dealer: Seat, rules: RuleProfile): Map<Seat, number> {
  const n = rules.game.playerCount;
  const split = n === 3 && rules.sanma.tsumoPayment === 'split';
  const map = new Map<Seat, number>();
  for (const s of others(winner, n)) {
    let mult: number;
    if (winner === dealer) mult = split ? 3 : 2;
    else if (s === dealer) mult = split ? 2.5 : 2;
    else mult = split ? 1.5 : 1;
    map.set(s, roundUp100(base * mult));
  }
  return map;
}

export function computeWinPayments(input: WinPaymentInput): WinPayments {
  const { winner, dealer, method, rules } = input;
  const winnerIsDealer = winner === dealer;
  const payments: PaymentResult[] = [];
  const honbaPayments: PaymentResult[] = [];
  const pao = input.paoBase > 0 && input.paoSeat !== undefined ? input.paoSeat : undefined;

  if (method === 'ron') {
    const discarder = input.discarder;
    if (discarder === undefined) throw new Error('ロンの放銃者が未設定です');
    if (input.base > 0) payments.push({ from: discarder, to: winner, amount: ronAmount(input.base, winnerIsDealer), kind: 'hand' });
    if (input.paoBase > 0) {
      const full = ronAmount(input.paoBase, winnerIsDealer);
      if (pao === undefined || pao === discarder) {
        payments.push({ from: discarder, to: winner, amount: full, kind: 'hand' });
      } else {
        // ロン時の包: 放銃者と責任者で折半
        const half = roundUp100(full / 2);
        payments.push({ from: discarder, to: winner, amount: full - half, kind: 'hand' });
        payments.push({ from: pao, to: winner, amount: half, kind: 'pao' });
      }
    }
    if (input.honba > 0) {
      honbaPayments.push({ from: discarder, to: winner, amount: rules.settlement.honbaRon * input.honba, kind: 'honba' });
    }
  } else {
    if (input.base > 0) {
      for (const [seat, amount] of tsumoAmounts(input.base, winner, dealer, rules)) {
        payments.push({ from: seat, to: winner, amount, kind: 'hand' });
      }
    }
    if (input.paoBase > 0) {
      if (pao !== undefined) {
        // ツモ時の包: 責任者がロン相当額を全額負担
        payments.push({ from: pao, to: winner, amount: ronAmount(input.paoBase, winnerIsDealer), kind: 'pao' });
      } else {
        for (const [seat, amount] of tsumoAmounts(input.paoBase, winner, dealer, rules)) {
          payments.push({ from: seat, to: winner, amount, kind: 'hand' });
        }
      }
    }
    if (input.honba > 0) {
      if (pao !== undefined) {
        // 包のツモでは責任者が本場もまとめて支払う
        honbaPayments.push({
          from: pao,
          to: winner,
          amount: rules.settlement.honbaTsumoEach * (rules.game.playerCount - 1) * input.honba,
          kind: 'honba',
        });
      } else {
        for (const seat of others(winner, rules.game.playerCount)) {
          honbaPayments.push({ from: seat, to: winner, amount: rules.settlement.honbaTsumoEach * input.honba, kind: 'honba' });
        }
      }
    }
  }

  const depositTransfer =
    input.riichiSticks > 0
      ? { from: 'pot' as const, to: winner, amount: input.riichiSticks * rules.settlement.riichiStick, kind: 'deposit' as const }
      : null;

  return { payments: mergePayments(payments), honbaPayments, depositTransfer };
}

/** 同じ支払者・受取者・種類の明細をまとめる */
function mergePayments(list: PaymentResult[]): PaymentResult[] {
  const out: PaymentResult[] = [];
  for (const p of list) {
    const same = out.find((o) => o.from === p.from && o.to === p.to && o.kind === p.kind);
    if (same) same.amount += p.amount;
    else out.push({ ...p });
  }
  return out;
}

export const sumPayments = (list: readonly PaymentResult[]): number => list.reduce((a, p) => a + p.amount, 0);

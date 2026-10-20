import { seatsOf, type Seat } from '../mahjong/hand';
import type { RuleProfile } from '../rules';

/**
 * 順位・ウマ・オカ・最終収支（仕様書 第15章）。
 * 順位とウマ・オカは別々の処理として計算し、最後に合計がゼロになることを検証する。
 */

export interface Placement {
  seat: Seat;
  points: number;
  /** 1〜4。同点等分の設定では同順位が並ぶ */
  rank: number;
  /** 同点で順位点を分け合う場合の人数 */
  sharedWith: number;
}

/** 持ち点の大小で順位を決める。同点は設定に従う（起家に近い方が上位 / 同順位）。 */
export function computePlacements(points: readonly number[], rules: RuleProfile): Placement[] {
  const seats = seatsOf(rules.game.playerCount).sort((a, b) => (points[b]! - points[a]!) || a - b);
  const out: Placement[] = [];
  seats.forEach((seat, i) => {
    if (rules.settlement.tieBreak === 'seatOrder') {
      out.push({ seat, points: points[seat]!, rank: i + 1, sharedWith: 1 });
      return;
    }
    const firstIndex = seats.findIndex((s) => points[s] === points[seat]);
    const shared = seats.filter((s) => points[s] === points[seat]).length;
    out.push({ seat, points: points[seat]!, rank: firstIndex + 1, sharedWith: shared });
  });
  return out;
}

export interface SettlementRow {
  seat: Seat;
  points: number;
  rank: number;
  /** (持ち点 − 返し点) / 1000 */
  base: number;
  uma: number;
  oka: number;
  total: number;
}

export interface SettlementResult {
  rows: SettlementRow[];
  pointsTotal: number;
  expectedTotal: number;
  /** 持ち点合計が 開始点×4 と一致しない場合の差（供託の残りなど） */
  pointsDifference: number;
  totalSum: number;
  okaTotal: number;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function computeSettlement(points: readonly number[], rules: RuleProfile): SettlementResult {
  const { startingPoints, returnPoints } = rules.game;
  const uma = rules.settlement.uma;
  const n = rules.game.playerCount;
  const okaTotal = rules.settlement.okaEnabled ? ((returnPoints - startingPoints) * n) / 1000 : 0;
  const placements = computePlacements(points, rules);

  const rows: SettlementRow[] = placements.map((p) => {
    // 同点等分: 該当順位の順位点（と1位ならオカ）を人数で割る
    const ranks = Array.from({ length: p.sharedWith }, (_, i) => p.rank - 1 + i);
    const umaShare = ranks.reduce((a, r) => a + (uma[r] ?? 0), 0) / p.sharedWith;
    const okaShare = ranks.includes(0) ? okaTotal / p.sharedWith : 0;
    const base = (p.points - returnPoints) / 1000;
    return {
      seat: p.seat,
      points: p.points,
      rank: p.rank,
      base: round1(base),
      uma: round1(umaShare),
      oka: round1(okaShare),
      total: round1(base + umaShare + okaShare),
    };
  });
  const pointsTotal = points.reduce((a, b) => a + b, 0);
  const expectedTotal = startingPoints * n;
  return {
    rows,
    pointsTotal,
    expectedTotal,
    pointsDifference: pointsTotal - expectedTotal,
    totalSum: round1(rows.reduce((a, r) => a + r.total, 0)),
    okaTotal,
  };
}

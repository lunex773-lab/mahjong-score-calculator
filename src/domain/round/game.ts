import { userError, type RuleError } from '../errors';
import type { Seat, WinInput } from '../mahjong/hand';
import { tsumoAmounts } from '../mahjong/payment';
import { calculateHandScore, type ScoringResult } from '../mahjong/scoring';
import type { RuleProfile } from '../rules';
import { computePlacements } from '../settlement/settlement';

/**
 * 局進行と点棒移動（仕様書 第11章・第12章・第14章・第17章）。
 * 対局はイベント列として記録し、状態は常にイベントの再生で求める（再現性・Undo のため）。
 * 点棒の移動はすべて取引として記録し、局ごとにゼロサム（持ち点＋供託が一定）を検証する。
 */

/** 勝者ごとのアガリ入力。本場・供託・親・場風は対局状態から補う */
export type RecordedWin = Omit<WinInput, 'honba' | 'riichiSticks' | 'dealer' | 'roundWind'>;

export type AbortiveKind = 'nineTerminals' | 'fourWinds' | 'fourRiichi' | 'fourKans' | 'threeRon';

export const ABORTIVE_LABELS: Record<AbortiveKind, string> = {
  nineTerminals: '九種九牌',
  fourWinds: '四風子連打',
  fourRiichi: '四家立直',
  fourKans: '四槓散了',
  threeRon: '三家和',
};

export type GameEvent =
  | { type: 'hand_won'; riichi: Seat[]; wins: RecordedWin[] }
  | { type: 'exhaustive_draw'; riichi: Seat[]; tenpai: Seat[]; nagashi: Seat[] }
  | { type: 'abortive_draw'; kind: AbortiveKind; riichi: Seat[] }
  | { type: 'chombo'; seat: Seat }
  | { type: 'game_ended'; reason: 'agariYame' | 'tenpaiYame' | 'manual' }
  | {
      type: 'state_corrected';
      points: [number, number, number, number];
      roundWind: number;
      kyoku: number;
      honba: number;
      deposits: number;
    };

export type TransactionReason =
  | 'riichi'
  | 'hand'
  | 'honba'
  | 'deposit'
  | 'pao'
  | 'noten'
  | 'nagashi'
  | 'chombo'
  | 'leftover';

export interface Transaction {
  from: Seat | 'pot';
  to: Seat | 'pot';
  amount: number;
  reason: TransactionReason;
}

export interface HandLog {
  /** 例: 東1局 0本場 */
  label: string;
  event: GameEvent;
  transactions: Transaction[];
  results: ScoringResult[];
  pointsAfter: number[];
  summary: string;
}

export type PendingDecision = 'agariYame' | 'tenpaiYame' | null;

export interface GameState {
  rules: RuleProfile;
  players: [string, string, string, string];
  points: number[];
  /** 場風（27=東, 28=南） */
  roundWind: number;
  /** 1〜4 */
  kyoku: number;
  honba: number;
  /** 場に出ているリーチ棒の本数 */
  deposits: number;
  finished: boolean;
  endReason: string | null;
  pending: PendingDecision;
  logs: HandLog[];
}

export const dealerOf = (s: Pick<GameState, 'kyoku'>): Seat => ((s.kyoku - 1) % 4) as Seat;

export const roundLabel = (s: Pick<GameState, 'roundWind' | 'kyoku' | 'honba'>): string =>
  `${'東南西北'[s.roundWind - 27] ?? '?'}${s.kyoku}局 ${s.honba}本場`;

export function initialState(rules: RuleProfile, players: [string, string, string, string]): GameState {
  return {
    rules,
    players,
    points: [0, 1, 2, 3].map(() => rules.game.startingPoints),
    roundWind: 27,
    kyoku: 1,
    honba: 0,
    deposits: 0,
    finished: false,
    endReason: null,
    pending: null,
    logs: [],
  };
}

export interface ApplyResult {
  ok: boolean;
  state: GameState;
  errors: RuleError[];
}

/** 和了者の優先順（放銃者の下家から順に近い者）。頭ハネ・供託の受取者の判定に使う */
export function ronPriority(discarder: Seat, winner: Seat): number {
  return (winner - discarder + 4) % 4;
}

function lastRoundWind(rules: RuleProfile): number {
  return rules.game.length === 'east' ? 27 : 28;
}

function totalOf(s: GameState): number {
  return s.points.reduce((a, b) => a + b, 0) + s.deposits * s.rules.settlement.riichiStick;
}

/** イベントを1件適用する。不正なイベントは状態を変えずにエラーを返す。 */
export function applyEvent(prev: GameState, event: GameEvent): ApplyResult {
  if (prev.finished && event.type !== 'state_corrected') {
    return { ok: false, state: prev, errors: [userError('INVALID_ROUND_STATE', '対局はすでに終了しています')] };
  }
  const s: GameState = { ...prev, points: [...prev.points], logs: prev.logs, pending: null };
  const tx: Transaction[] = [];
  const errors: RuleError[] = [];
  const label = roundLabel(prev);
  const rules = s.rules;
  const stick = rules.settlement.riichiStick;
  const before = totalOf(prev);

  const move = (from: Seat | 'pot', to: Seat | 'pot', amount: number, reason: TransactionReason) => {
    if (amount === 0) return;
    if (from === 'pot') s.deposits -= amount / stick;
    else s.points[from] = s.points[from]! - amount;
    if (to === 'pot') s.deposits += amount / stick;
    else s.points[to] = s.points[to]! + amount;
    tx.push({ from, to, amount, reason });
  };

  const depositRiichi = (seats: Seat[]): boolean => {
    if (new Set(seats).size !== seats.length) {
      errors.push(userError('INVALID_RIICHI_STATE', '同じ人のリーチが重複しています'));
      return false;
    }
    for (const seat of seats) {
      if (s.points[seat]! < stick) {
        errors.push(
          userError('INVALID_RIICHI_STATE', `${prev.players[seat]}さんは持ち点が${stick}点未満のためリーチできません`),
        );
        return false;
      }
      move(seat, 'pot', stick, 'riichi');
    }
    return true;
  };

  const results: ScoringResult[] = [];
  let summary = '';
  let renchan = false;
  let advanceKind: 'win' | 'draw' | 'abortive' | 'none' = 'none';
  const dealer = dealerOf(prev);

  switch (event.type) {
    case 'hand_won': {
      const wins = event.wins;
      if (wins.length === 0) {
        errors.push(userError('INVALID_MULTIPLE_RON', 'アガった人を選んでください'));
        break;
      }
      const winners = wins.map((w) => w.winner);
      if (new Set(winners).size !== winners.length) {
        errors.push(userError('INVALID_MULTIPLE_RON', '同じ人が複数回アガることはできません'));
        break;
      }
      if (wins.length > 1) {
        const discarders = new Set(wins.map((w) => w.discarder));
        if (wins.some((w) => w.method !== 'ron') || discarders.size !== 1) {
          errors.push(userError('INVALID_MULTIPLE_RON', '複数人のアガリは、同じ人の捨て牌へのロンのときだけです'));
          break;
        }
        const limit = rules.wins.multipleRon === 'headBump' ? 1 : rules.wins.multipleRon === 'doubleRon' ? 2 : 3;
        if (wins.length > limit) {
          const msg =
            rules.wins.multipleRon === 'headBump'
              ? '現在のルールは頭ハネです。放銃者の下家に近い1人だけをアガリとして入力してください'
              : wins.length === 3 && rules.draws.threeRon
                ? '3人がロンした場合は三家和（途中流局）として記録してください'
                : `現在のルールでは同時にアガれるのは${limit}人までです`;
          errors.push(userError('INVALID_MULTIPLE_RON', msg));
          break;
        }
      }
      for (const w of wins) {
        const winnerRiichi = w.flags.riichi || w.flags.doubleRiichi;
        if (winnerRiichi !== event.riichi.includes(w.winner)) {
          errors.push(
            userError('INVALID_RIICHI_STATE', `${prev.players[w.winner]}さんのリーチ設定とリーチ者の一覧が一致しません`),
          );
        }
      }
      if (errors.length > 0) break;
      if (!depositRiichi(event.riichi)) break;

      const ordered = [...wins].sort((a, b) =>
        a.discarder === undefined || b.discarder === undefined
          ? 0
          : ronPriority(a.discarder, a.winner) - ronPriority(b.discarder, b.winner),
      );
      const parts: string[] = [];
      ordered.forEach((w, i) => {
        if (errors.length > 0) return;
        const first = i === 0;
        const input: WinInput = {
          ...w,
          dealer,
          roundWind: prev.roundWind,
          honba: first || rules.wins.multipleRonHonba === 'each' ? prev.honba : 0,
          riichiSticks: first ? s.deposits : 0,
        };
        const r = calculateHandScore(input, rules);
        if (!r.valid) {
          errors.push(
            ...r.errors.map((e) => ({ ...e, message: `${prev.players[w.winner]}さんのアガリ: ${e.message}` })),
          );
          return;
        }
        results.push(r);
        for (const p of [...r.payments, ...r.honbaPayments]) move(p.from, p.to, p.amount, p.kind);
        if (r.depositTransfer) move('pot', r.depositTransfer.to, r.depositTransfer.amount, 'deposit');
        parts.push(`${prev.players[w.winner]} ${w.method === 'ron' ? 'ロン' : 'ツモ'} ${r.winnerTotal.toLocaleString()}点`);
      });
      if (errors.length > 0) break;
      summary = parts.join(' ／ ');
      renchan = winners.includes(dealer);
      advanceKind = 'win';
      break;
    }

    case 'exhaustive_draw': {
      const { tenpai, nagashi, riichi } = event;
      const notenRiichi = riichi.filter((r) => !tenpai.includes(r));
      if (notenRiichi.length > 0) {
        errors.push(
          userError(
            'INVALID_RIICHI_STATE',
            `${notenRiichi.map((r) => prev.players[r]).join('・')}さんはリーチしているのでテンパイが必要です。ノーテンリーチはチョンボとして記録してください`,
          ),
        );
        break;
      }
      if (nagashi.length > 0 && !rules.draws.nagashiMangan) {
        errors.push(userError('UNSUPPORTED_RULE', '現在のルールでは流し満貫を採用していません'));
        break;
      }
      if (!depositRiichi(riichi)) break;
      if (nagashi.length > 0) {
        // 流し満貫: 満貫ツモ相当の支払い。本場は付けず、ノーテン罰符は発生しない
        for (const seat of nagashi) {
          for (const [payer, amount] of tsumoAmounts(2000, seat, dealer)) move(payer, seat, amount, 'nagashi');
        }
        summary = `流し満貫: ${nagashi.map((n) => prev.players[n]).join('・')}`;
      } else {
        const k = tenpai.length;
        const pool = rules.draws.notenPenaltyTotal;
        if (k > 0 && k < 4) {
          const pay = pool / (4 - k);
          const receive = pool / k;
          const notens = ([0, 1, 2, 3] as Seat[]).filter((x) => !tenpai.includes(x));
          // 支払いを受取額に分配（ゼロサム）
          const owed = new Map<Seat, number>(notens.map((n) => [n, pay]));
          for (const t of tenpai) {
            let need = receive;
            for (const n of notens) {
              const give = Math.min(need, owed.get(n)!);
              if (give > 0) {
                move(n, t, give, 'noten');
                owed.set(n, owed.get(n)! - give);
                need -= give;
              }
            }
          }
        }
        summary = k === 0 ? '流局（全員ノーテン）' : k === 4 ? '流局（全員テンパイ）' : `流局 テンパイ: ${tenpai.map((t) => prev.players[t]).join('・')}`;
      }
      renchan = tenpai.includes(dealer);
      advanceKind = 'draw';
      break;
    }

    case 'abortive_draw': {
      const enabled: Record<AbortiveKind, boolean> = {
        nineTerminals: rules.draws.nineTerminals,
        fourWinds: rules.draws.fourWinds,
        fourRiichi: rules.draws.fourRiichi,
        fourKans: rules.draws.fourKans,
        threeRon: rules.draws.threeRon,
      };
      if (!enabled[event.kind]) {
        errors.push(userError('UNSUPPORTED_RULE', `現在のルールでは${ABORTIVE_LABELS[event.kind]}による途中流局を採用していません`));
        break;
      }
      if (event.kind === 'fourRiichi' && new Set(event.riichi).size !== 4) {
        errors.push(userError('INVALID_RIICHI_STATE', '四家立直は4人全員のリーチが必要です'));
        break;
      }
      if (event.kind === 'nineTerminals' && event.riichi.length > 0) {
        errors.push(userError('INVALID_RIICHI_STATE', '九種九牌は第一巡目の宣言のため、リーチ者はいないはずです'));
        break;
      }
      if (!depositRiichi(event.riichi)) break;
      summary = `途中流局（${ABORTIVE_LABELS[event.kind]}）`;
      renchan = true;
      advanceKind = 'abortive';
      break;
    }

    case 'chombo': {
      // 満貫払い: 親のチョンボは4000オール、子のチョンボは親4000・子2000。局はやり直し
      const offender = event.seat;
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        if (seat === offender) continue;
        const amount = offender === dealer || seat === dealer ? 4000 : 2000;
        move(offender, seat, amount, 'chombo');
      }
      summary = `チョンボ: ${prev.players[offender]}（満貫払い・局はやり直し）`;
      advanceKind = 'none';
      break;
    }

    case 'game_ended': {
      if (event.reason !== 'manual' && prev.pending !== event.reason) {
        errors.push(userError('INVALID_ROUND_STATE', 'アガリやめ・テンパイやめはオーラスで親がトップのときだけ選べます'));
        break;
      }
      finishGame(s, move, event.reason === 'manual' ? '手動で終了' : event.reason === 'agariYame' ? 'アガリやめ' : 'テンパイやめ');
      summary = `対局終了（${s.endReason}）`;
      break;
    }

    case 'state_corrected': {
      if (event.points.some((p) => !Number.isInteger(p)) || event.honba < 0 || event.deposits < 0) {
        errors.push(userError('INVALID_ROUND_STATE', '修正値が不正です'));
        break;
      }
      if (event.kyoku < 1 || event.kyoku > 4 || event.roundWind < 27 || event.roundWind > lastRoundWind(rules)) {
        errors.push(userError('INVALID_ROUND_STATE', '局の指定が不正です'));
        break;
      }
      s.points = [...event.points];
      s.roundWind = event.roundWind;
      s.kyoku = event.kyoku;
      s.honba = event.honba;
      s.deposits = event.deposits;
      s.finished = false;
      s.endReason = null;
      summary = '局の状態を手動で修正';
      break;
    }
  }

  if (errors.length > 0) return { ok: false, state: prev, errors };

  if (event.type !== 'state_corrected' && totalOf(s) !== before) {
    return {
      ok: false,
      state: prev,
      errors: [
        {
          code: 'POINT_CONSERVATION_FAILED',
          message: `点棒の合計が一致しません（前 ${before} / 後 ${totalOf(s)}）`,
          userFixable: false,
        },
      ],
    };
  }

  if (advanceKind !== 'none') advanceRound(s, renchan, advanceKind, move);
  else if (event.type === 'chombo' && rules.game.bustStop && s.points.some((p) => p < 0)) finishGame(s, move, 'トビ終了');

  s.logs = [
    ...prev.logs,
    { label, event, transactions: tx, results, pointsAfter: [...s.points], summary },
  ];
  return { ok: true, state: s, errors: [] };
}

function advanceRound(
  s: GameState,
  renchan: boolean,
  kind: 'win' | 'draw' | 'abortive',
  move: (from: Seat | 'pot', to: Seat | 'pot', amount: number, reason: TransactionReason) => void,
): void {
  const rules = s.rules;
  const wasLast = s.roundWind === lastRoundWind(rules) && s.kyoku === 4;
  const dealer = dealerOf(s);

  if (rules.game.bustStop && s.points.some((p) => p < 0)) {
    finishGame(s, move, 'トビ終了');
    return;
  }

  if (renchan) {
    s.honba += 1;
    if (wasLast && kind !== 'abortive') {
      const top = computePlacements(s.points, rules)[0]!.seat;
      if (top === dealer) {
        if (kind === 'win' && rules.game.agariYame) s.pending = 'agariYame';
        if (kind === 'draw' && rules.game.tenpaiYame) s.pending = 'tenpaiYame';
      }
    }
    return;
  }

  s.honba = kind === 'win' ? 0 : s.honba + 1;
  if (wasLast) {
    finishGame(s, move, '規定局数の終了');
    return;
  }
  if (s.kyoku === 4) {
    s.kyoku = 1;
    s.roundWind += 1;
  } else {
    s.kyoku += 1;
  }
}

function finishGame(
  s: GameState,
  move: (from: Seat | 'pot', to: Seat | 'pot', amount: number, reason: TransactionReason) => void,
  reason: string,
): void {
  s.finished = true;
  s.endReason = reason;
  s.pending = null;
  if (s.deposits > 0 && s.rules.game.leftoverDeposit === 'top') {
    const top = computePlacements(s.points, s.rules)[0]!.seat;
    move('pot', top, s.deposits * s.rules.settlement.riichiStick, 'leftover');
  }
}

/** イベント列から状態を再構築する。途中で不正なイベントがあればそこで停止しエラーを返す。 */
export function replay(
  rules: RuleProfile,
  players: [string, string, string, string],
  events: readonly GameEvent[],
): { state: GameState; errors: RuleError[]; appliedCount: number } {
  let state = initialState(rules, players);
  for (let i = 0; i < events.length; i++) {
    const r = applyEvent(state, events[i]!);
    if (!r.ok) return { state, errors: r.errors, appliedCount: i };
    state = r.state;
  }
  return { state, errors: [], appliedCount: events.length };
}


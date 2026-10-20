import { describe, expect, it } from 'vitest';
import { applyEvent, initialState, replay, type GameEvent, type GameState, type RecordedWin } from '../../src/domain/round/game';
import { computeSettlement } from '../../src/domain/settlement/settlement';
import { DEFAULT_RULES, type RuleProfile } from '../../src/domain/rules';
import { winInput, type WinSpec } from '../fixtures/hand-builder';
import type { Seat } from '../../src/domain/mahjong/hand';

const players: [string, string, string, string] = ['A', 'B', 'C', 'D'];
const rules = DEFAULT_RULES;
const withRules = (patch: (r: RuleProfile) => void): RuleProfile => {
  const copy = structuredClone(DEFAULT_RULES);
  patch(copy);
  return copy;
};

function recorded(spec: WinSpec): RecordedWin {
  const { honba: _h, riichiSticks: _r, dealer: _d, roundWind: _w, ...rest } = winInput(spec);
  return rest;
}

/** リーチ平和（子ロン 2000 / 親ロン 2900）。ドラ表示牌は 9s */
const pinfu = (winner: Seat, discarder: Seat, riichi = true): RecordedWin =>
  recorded({
    hand: '123m456p789s23s55p',
    win: '4s',
    winner,
    discarder,
    flags: { riichi },
    ...(riichi ? { ura: '4z' } : {}),
  });

function run(events: GameEvent[], r: RuleProfile = rules): GameState {
  const out = replay(r, players, events);
  expect(out.errors).toEqual([]);
  return out.state;
}

const sum = (s: GameState) => s.points.reduce((a, b) => a + b, 0) + s.deposits * 1000;

describe('アガリと局進行', () => {
  it('子のロン: 点棒移動・リーチ棒供託・親流れ・本場リセット', () => {
    const s = run([{ type: 'hand_won', riichi: [1], wins: [pinfu(1, 2)] }]);
    // B: -1000(リーチ) +2000 +1000(自分の供託) / C: -2000
    expect(s.points).toEqual([30000, 32000, 28000, 30000]);
    expect(s.deposits).toBe(0);
    expect([s.roundWind, s.kyoku, s.honba]).toEqual([27, 2, 0]);
    expect(sum(s)).toBe(120000);
  });

  it('親のアガリは連荘・本場+1、本場は次のアガリに加算', () => {
    const s = run([
      { type: 'hand_won', riichi: [0], wins: [pinfu(0, 1)] },
      { type: 'hand_won', riichi: [], wins: [pinfu(2, 3, false)] },
    ]);
    // 1局目: 親リーチ平和ロン 2900 / 2局目(東1局1本場): C 平和ロン 1000 + 300
    expect(s.points).toEqual([32900, 27100, 31300, 28700]);
    expect([s.kyoku, s.honba]).toEqual([2, 0]);
  });

  it('ダブロン: 供託・本場は放銃者の下家側に近い人（上家取り）', () => {
    const r = withRules((x) => (x.wins.multipleRon = 'doubleRon'));
    const s = run(
      [
        { type: 'abortive_draw', kind: 'fourWinds', riichi: [] },
        { type: 'hand_won', riichi: [1, 3], wins: [pinfu(3, 0), pinfu(1, 0)] },
      ],
      r,
    );
    // 放銃者=親(東席)。下家は南席(1)が最優先。1本場。
    // B: -1000 + 2000 + 300 + 2000(供託2本) = +3300 / D: -1000 + 2000 = +1000 / A: -2000-300-2000
    expect(s.points).toEqual([25700, 33300, 30000, 31000]);
    expect(sum(s)).toBe(120000);
  });

  it('頭ハネのルールで2人入力はエラー、三家和は途中流局として記録', () => {
    const head = withRules((x) => (x.wins.multipleRon = 'headBump'));
    const res = applyEvent(initialState(head, players), { type: 'hand_won', riichi: [], wins: [pinfu(3, 0, false), pinfu(1, 0, false)] });
    expect(res.errors[0]?.code).toBe('INVALID_MULTIPLE_RON');
    const three = applyEvent(initialState(rules, players), {
      type: 'hand_won',
      riichi: [],
      wins: [pinfu(3, 0, false), pinfu(1, 0, false), pinfu(2, 0, false)],
    });
    expect(three.errors[0]?.message).toContain('三家和');
  });

  it('リーチ設定と一覧の不一致はエラー', () => {
    const res = applyEvent(initialState(rules, players), { type: 'hand_won', riichi: [], wins: [pinfu(1, 2)] });
    expect(res.ok).toBe(false);
    expect(res.errors[0]?.code).toBe('INVALID_RIICHI_STATE');
  });

  it('役なしのアガリは記録できない（状態は変わらない）', () => {
    const bad = recorded({ hand: '123m456p789s11z77p', win: '7p', winner: 1, discarder: 2 });
    const res = applyEvent(initialState(rules, players), { type: 'hand_won', riichi: [], wins: [bad] });
    expect(res.ok).toBe(false);
    expect(res.state.points).toEqual([30000, 30000, 30000, 30000]);
  });
});

describe('流局', () => {
  it.each([
    [[1], [-1000, 3000, -1000, -1000]],
    [[0, 2], [1500, -1500, 1500, -1500]],
    [[0, 1, 2], [1000, 1000, 1000, -3000]],
    [[], [0, 0, 0, 0]],
    [[0, 1, 2, 3], [0, 0, 0, 0]],
  ] as [Seat[], number[]][])('ノーテン罰符 テンパイ=%j', (tenpai, delta) => {
    const s = run([{ type: 'exhaustive_draw', riichi: [], tenpai, nagashi: [] }]);
    expect(s.points.map((p) => p - 30000)).toEqual(delta);
    expect(s.honba).toBe(1);
    // 親(東席=0)がテンパイなら連荘
    expect(s.kyoku).toBe(tenpai.includes(0) ? 1 : 2);
  });

  it('流局時はリーチ棒が供託に残り、次のアガリ者が取る', () => {
    const s = run([
      { type: 'exhaustive_draw', riichi: [2], tenpai: [2], nagashi: [] },
      { type: 'hand_won', riichi: [], wins: [pinfu(3, 2, false)] },
    ]);
    // 流局: C +3000-1000(リーチ)=32000、供託1。次局(東2局1本場): D が C から平和ロン 1000+300、供託1000
    expect(s.points).toEqual([29000, 29000, 30700, 31300]);
    expect(s.deposits).toBe(0);
  });

  it('ノーテンリーチは流局として記録できない（チョンボとして記録する）', () => {
    const res = applyEvent(initialState(rules, players), { type: 'exhaustive_draw', riichi: [1], tenpai: [], nagashi: [] });
    expect(res.errors[0]?.code).toBe('INVALID_RIICHI_STATE');
  });

  it('流し満貫: 満貫ツモ相当、ノーテン罰符なし', () => {
    const s = run([{ type: 'exhaustive_draw', riichi: [], tenpai: [0], nagashi: [2] }]);
    expect(s.points).toEqual([26000, 28000, 38000, 28000]);
    expect([s.kyoku, s.honba]).toEqual([1, 1]);
  });

  it('途中流局は連荘・本場+1、設定で不採用ならエラー', () => {
    const s = run([{ type: 'abortive_draw', kind: 'nineTerminals', riichi: [] }]);
    expect([s.kyoku, s.honba]).toEqual([1, 1]);
    const off = withRules((x) => (x.draws.nineTerminals = false));
    expect(applyEvent(initialState(off, players), { type: 'abortive_draw', kind: 'nineTerminals', riichi: [] }).ok).toBe(false);
  });

  it('四家立直は4人のリーチ棒が供託に残る', () => {
    const s = run([{ type: 'abortive_draw', kind: 'fourRiichi', riichi: [0, 1, 2, 3] }]);
    expect(s.deposits).toBe(4);
    expect(s.points).toEqual([29000, 29000, 29000, 29000]);
  });
});

describe('チョンボ', () => {
  it('子のチョンボは親4000・子2000、局はやり直し', () => {
    const s = run([{ type: 'chombo', seat: 2 }]);
    expect(s.points).toEqual([34000, 32000, 22000, 32000]);
    expect([s.kyoku, s.honba]).toEqual([1, 0]);
  });
  it('親のチョンボは4000オール', () => {
    const s = run([{ type: 'chombo', seat: 0 }]);
    expect(s.points).toEqual([18000, 34000, 34000, 34000]);
  });
});

describe('半荘終了', () => {
  const toLast: GameEvent = {
    type: 'state_corrected',
    points: [30000, 30000, 30000, 30000],
    roundWind: 28,
    kyoku: 4,
    honba: 0,
    deposits: 0,
  };

  it('南4局で子がアガると終了', () => {
    const s = run([toLast, { type: 'hand_won', riichi: [], wins: [pinfu(0, 1, false)] }]);
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe('規定局数の終了');
  });

  it('オーラスで親(北席)がトップならアガリやめを選べる', () => {
    const s1 = run([toLast, { type: 'hand_won', riichi: [], wins: [pinfu(3, 1, false)] }]);
    expect(s1.finished).toBe(false);
    expect(s1.pending).toBe('agariYame');
    const s2 = applyEvent(s1, { type: 'game_ended', reason: 'agariYame' });
    expect(s2.state.finished).toBe(true);
    // 続行する場合は次のイベントで pending が解除される
    const s3 = applyEvent(s1, { type: 'exhaustive_draw', riichi: [], tenpai: [], nagashi: [] });
    expect(s3.state.finished).toBe(true);
  });

  it('アガリやめはオーラス以外では選べない', () => {
    expect(applyEvent(initialState(rules, players), { type: 'game_ended', reason: 'agariYame' }).ok).toBe(false);
  });

  it('トビ終了と残供託はトップへ', () => {
    const s = run([
      { ...toLast, points: [30000, 30000, 31000, 900], kyoku: 1, roundWind: 27, deposits: 0 },
      { type: 'exhaustive_draw', riichi: [2], tenpai: [2], nagashi: [] },
    ]);
    // D はノーテン罰符で -100 点 → トビ。供託1本はトップの C へ
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe('トビ終了');
    expect(s.points).toEqual([29000, 29000, 34000, -100]);
    expect(s.deposits).toBe(0);
  });
});

describe('精算（順位・ウマ・オカ）', () => {
  it('30000持ち30000返し ウマ15-30', () => {
    const r = computeSettlement([45000, 32000, 25000, 18000], rules);
    expect(r.rows.map((x) => [x.seat, x.rank, x.total])).toEqual([
      [0, 1, 45],
      [1, 2, 12],
      [2, 3, -15],
      [3, 4, -42],
    ]);
    expect(r.totalSum).toBe(0);
  });

  it('25000持ち30000返し ウマ10-20 はオカ+20をトップへ', () => {
    const r = computeSettlement(
      [40000, 30000, 20000, 10000],
      withRules((x) => {
        x.game.startingPoints = 25000;
        x.settlement.uma = [20, 10, -10, -20];
      }),
    );
    expect(r.rows.map((x) => x.total)).toEqual([50, 10, -20, -40]);
    expect(r.totalSum).toBe(0);
  });

  it('同点は起家に近い方が上位、等分設定なら順位点を分ける', () => {
    const pts = [25000, 35000, 35000, 25000];
    const seat = computeSettlement(pts, rules);
    expect(seat.rows.map((x) => [x.seat, x.rank])).toEqual([
      [1, 1],
      [2, 2],
      [0, 3],
      [3, 4],
    ]);
    const split = computeSettlement(pts, withRules((x) => (x.settlement.tieBreak = 'split')));
    expect(split.rows.map((x) => x.total)).toEqual([25, 25, -25, -25]);
    expect(split.totalSum).toBe(0);
  });

  it('持ち点合計の不一致を検出', () => {
    expect(computeSettlement([30000, 30000, 30000, 29000], rules).pointsDifference).toBe(-1000);
  });
});

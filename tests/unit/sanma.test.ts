import { describe, expect, it } from 'vitest';
import type { Seat } from '../../src/domain/mahjong/hand';
import { calculateHandScore } from '../../src/domain/mahjong/scoring';
import { tsumoAmounts } from '../../src/domain/mahjong/payment';
import { applyEvent, initialState, replay, type GameEvent, type GameState, type RecordedWin } from '../../src/domain/round/game';
import { DEFAULT_RULES, DEFAULT_SANMA_RULES, migrateRuleProfile, validateRuleProfile, type RuleProfile } from '../../src/domain/rules';
import { computeSettlement } from '../../src/domain/settlement/settlement';
import { meld, winInput, type WinSpec } from '../fixtures/hand-builder';

/*
 * 三人麻雀（3人打ち仕様書）のテスト。
 * 役・翻・符は4人打ちと同じ判定（独立実装との照合済み）を使うため、ここでは3人打ち特有の
 * 牌構成・ドラ循環・北抜き・ツモ支払い・局進行・精算を、点数式と仕様書の規則から導いた値で確認する。
 *   基本点 = 符 × 2^(翻+2)、満貫 2000、各支払いは最後に1回だけ100点単位へ切り上げ
 *   折半: 親のツモは各自 基本点×3、子のツモは親 ×2.5・子 ×1.5
 *   ツモ損: 4人打ちと同じ額（親 ×2・子 ×1、親のツモは各自 ×2）を2人が払う
 */

const rules = DEFAULT_SANMA_RULES;
const withRules = (patch: (r: RuleProfile) => void, base: RuleProfile = DEFAULT_SANMA_RULES): RuleProfile => {
  const copy = structuredClone(base);
  patch(copy);
  return copy;
};
/** 3人打ちの既定: 東場・親=東席(0)・アガリ=南席(1)・放銃=西席(2)。ドラ表示牌は 9s（→1s） */
const score = (spec: WinSpec & { nuki?: number }, r: RuleProfile = rules) =>
  calculateHandScore({ ...winInput({ discarder: 2, ...spec }), nukiCount: spec.nuki ?? 0 }, r);

describe('3人打ちの牌構成', () => {
  it('二萬〜八萬は使えない（INVALID_SANMA_TILE）', () => {
    const r = score({ hand: '234m456p789s23s55p', win: '4s' });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain('INVALID_SANMA_TILE');
  });

  it('一萬・九萬は使える（国士無双）', () => {
    const r = score({ hand: '19m19p19s1234567z', win: '1m' });
    expect(r.yakuman.map((y) => y.yakuId)).toEqual(['kokushi']);
  });

  it('萬子のドラ表示牌は 一萬→九萬、九萬→一萬', () => {
    // 111m 999m … ドラ表示牌 1m なら 9m がドラ（3枚）
    const spec: WinSpec = { hand: '111m999m123p456s7z', win: '7z', method: 'tsumo' };
    const d1 = score({ ...spec, dora: '1m' }).dora.find((d) => d.type === 'dora');
    expect(d1?.count).toBe(3);
    expect(d1?.label).toContain('1萬→9萬');
    const d9 = score({ ...spec, dora: '9m' }).dora.find((d) => d.type === 'dora');
    expect(d9?.count).toBe(3);
    // 4人打ちでは 1m→2m なので 9m はドラにならない
    const four = calculateHandScore(winInput({ ...spec, dora: '1m' }), DEFAULT_RULES).dora.find((d) => d.type === 'dora');
    expect(four?.count).toBe(0);
  });
});

describe('北抜き（抜きドラ）', () => {
  // リーチ平和（筒子・索子のみ）: 子ロン 2翻30符 = 2000
  const pinfu: WinSpec = { hand: '123p456p789s23s55p', win: '4s', flags: { riichi: true }, ura: '1z' };

  it('抜いた北は1枚1翻、内訳を別に表示する', () => {
    const r = score({ ...pinfu, nuki: 2 });
    expect(r.dora.find((d) => d.type === 'nuki')?.count).toBe(2);
    expect(r.han.totalHan).toBe(4); // 立直・平和・抜きドラ2
    expect(r.winnerTotal).toBe(7700); // 30符4翻 子ロン
  });

  it('表示牌が西（北がドラ）なら、抜いた北はドラとしても数える', () => {
    const r = score({ ...pinfu, nuki: 1, dora: '3z' });
    expect(r.dora.find((d) => d.type === 'dora')?.count).toBe(1);
    expect(r.dora.find((d) => d.type === 'nuki')?.count).toBe(1);
  });

  it('北抜きだけでは役にならない（NO_YAKU）', () => {
    // 111p 789p 123s 222s 北北: 暗刻は2つまでで役が無い
    const r = score({ hand: '111p789p123s22s44z', win: '2s', nuki: 2 });
    expect(r.errors[0]?.code).toBe('NO_YAKU');
  });

  it('4人打ち・北抜きなしのルールでは入力できない', () => {
    expect(calculateHandScore({ ...winInput(pinfu), nukiCount: 1 }, DEFAULT_RULES).valid).toBe(false);
    const off = withRules((r) => (r.sanma.nukiDora = false));
    expect(score({ ...pinfu, nuki: 1 }, off).valid).toBe(false);
  });

  it('手牌の北と抜いた北を合わせて5枚以上にはできない', () => {
    const r = score({ hand: '444z123p456p789s5s', win: '5s', nuki: 2 });
    expect(r.errors.map((e) => e.code)).toContain('INVALID_TILE_COPIES');
  });
});

describe('北の役牌扱い', () => {
  const northPon: WinSpec = { hand: '123p456p55s78s', win: '9s', melds: [meld('pon', '444z', 2)] };
  it('初期設定では手牌の北の刻子は役牌にならない', () => {
    expect(score(northPon).errors[0]?.code).toBe('NO_YAKU');
  });
  it('北を役牌とする設定では1翻', () => {
    const r = score(northPon, withRules((x) => (x.sanma.northYakuhai = true)));
    expect(r.yaku.map((y) => y.id)).toEqual(['yakuhai-north']);
  });
});

describe('副露', () => {
  it('初期設定ではチーできない', () => {
    const r = score({ hand: '567p345s67s88p', win: '8s', melds: [meld('chi', '234p', 0)] });
    expect(r.errors.map((e) => e.code)).toContain('INVALID_MELD');
  });
});

describe('ツモの支払い', () => {
  it('折半: 子の満貫ツモは親5000・子3000（合計8000）、親の満貫ツモは6000オール', () => {
    expect([...tsumoAmounts(2000, 1, 0, rules)]).toEqual([
      [0, 5000],
      [2, 3000],
    ]);
    expect([...tsumoAmounts(2000, 0, 0, rules).values()]).toEqual([6000, 6000]);
  });

  it('折半: 子の30符1翻ツモは親600・子400（ロンと同じ合計1000）', () => {
    // 基本点 30×2^3 = 240 → 親 240×2.5=600、子 240×1.5=360→400
    expect([...tsumoAmounts(240, 1, 0, rules).values()]).toEqual([600, 400]);
  });

  it('ツモ損: 子の満貫ツモは親4000・子2000（合計6000）', () => {
    const loss = withRules((r) => (r.sanma.tsumoPayment = 'loss'));
    expect([...tsumoAmounts(2000, 1, 0, loss).values()]).toEqual([4000, 2000]);
    expect([...tsumoAmounts(2000, 0, 0, loss).values()]).toEqual([4000, 4000]);
  });

  it('アガリの計算に反映される（子のメンゼンツモ平和 3翻20符 + 1本場）', () => {
    // 基本点 20×2^5 = 640 → 親 640×2.5=1600、子 640×1.5=960→1000、本場は各150
    const r = score({ hand: '123p456p789s23s55p', win: '4s', method: 'tsumo', flags: { riichi: true }, ura: '1z', honba: 1 });
    expect(r.payments.map((p) => [p.from, p.amount])).toEqual([
      [0, 1600],
      [2, 1000],
    ]);
    expect(r.honbaPayments.map((p) => p.amount)).toEqual([150, 150]);
    expect(r.winnerTotal).toBe(2900);
  });

  it('ロンは4人打ちと同じ（子2000・親2900）', () => {
    const spec: WinSpec = { hand: '123p456p789s23s55p', win: '4s', flags: { riichi: true }, ura: '1z' };
    expect(score(spec).winnerTotal).toBe(2000);
    expect(score({ ...spec, winner: 0, discarder: 1 }).winnerTotal).toBe(2900);
  });

  it('自風は東・南・西のみ（北家はいない）', () => {
    // 東2局（親=南席）では東席の自風は西 → 西の刻子は自風牌
    const r = score({ hand: '333z123p456p78s99s', win: '9s', winner: 0, dealer: 1, discarder: 2 });
    expect(r.yaku.map((y) => y.id)).toEqual(['yakuhai-seat-wind']);
    expect(score({ hand: '333z123p456p78s99s', win: '9s', winner: 0, dealer: 1, discarder: 3 as Seat }).valid).toBe(false);
  });
});

describe('3人打ちの局進行', () => {
  const players = ['A', 'B', 'C'];
  const run = (events: GameEvent[], r: RuleProfile = rules): GameState => {
    const out = replay(r, players, events);
    expect(out.errors).toEqual([]);
    return out.state;
  };
  const recorded = (spec: WinSpec): RecordedWin => {
    const { honba: _h, riichiSticks: _r, dealer: _d, roundWind: _w, ...rest } = winInput(spec);
    return rest;
  };
  const pinfuRon = (winner: Seat, discarder: Seat): RecordedWin =>
    recorded({ hand: '123p456p789s23s55p', win: '4s', winner, discarder });
  const sum = (s: GameState) => s.points.reduce((a, b) => a + b, 0) + s.deposits * 1000;

  it('開始は3人×35,000点、東1局→東2局→東3局→南1局と進む', () => {
    const s0 = initialState(rules, players);
    expect(s0.points).toEqual([35000, 35000, 35000]);
    const s = run([
      { type: 'hand_won', riichi: [], wins: [pinfuRon(1, 2)] },
      { type: 'hand_won', riichi: [], wins: [pinfuRon(2, 0)] },
      { type: 'hand_won', riichi: [], wins: [pinfuRon(0, 1)] },
    ]);
    expect([s.roundWind, s.kyoku, s.honba]).toEqual([28, 1, 0]);
    expect(sum(s)).toBe(105000);
  });

  it('南3局で親以外がアガると終了', () => {
    const s = run([
      { type: 'state_corrected', points: [35000, 35000, 35000], roundWind: 28, kyoku: 3, honba: 0, deposits: 0 },
      { type: 'hand_won', riichi: [], wins: [pinfuRon(0, 1)] },
    ]);
    expect(s.finished).toBe(true);
  });

  it('ノーテン罰符（場2,000点）: 1人テンパイは+2000、2人テンパイは各+1000', () => {
    const one = run([{ type: 'exhaustive_draw', riichi: [], tenpai: [1], nagashi: [] }]);
    expect(one.points.map((p) => p - 35000)).toEqual([-1000, 2000, -1000]);
    const two = run([{ type: 'exhaustive_draw', riichi: [], tenpai: [0, 2], nagashi: [] }]);
    expect(two.points.map((p) => p - 35000)).toEqual([1000, -2000, 1000]);
    expect([two.kyoku, two.honba]).toEqual([1, 1]);
  });

  it('ダブロンはできるが、3人目のアガリは存在しない', () => {
    const s = run([{ type: 'hand_won', riichi: [], wins: [pinfuRon(1, 0), pinfuRon(2, 0)] }]);
    // 平和のみ 1翻30符 = 各1000点を放銃者の東席が支払う
    expect(s.points).toEqual([33000, 36000, 36000]);
  });

  it('チョンボ（折半）: 子のチョンボは親へ5000・子へ3000', () => {
    const s = run([{ type: 'chombo', seat: 1 }]);
    expect(s.points).toEqual([40000, 27000, 38000]);
  });

  it('流し満貫（折半）: 子は親5000・子3000を受け取る', () => {
    const s = run([{ type: 'exhaustive_draw', riichi: [], tenpai: [], nagashi: [2] }]);
    expect(s.points).toEqual([30000, 32000, 43000]);
  });

  it('途中流局: 3人打ちに四風子連打は無い、三家立直は初期設定では不採用', () => {
    const s0 = initialState(rules, players);
    expect(applyEvent(s0, { type: 'abortive_draw', kind: 'fourWinds', riichi: [] }).errors[0]?.message).toContain('3人打ちにはありません');
    expect(applyEvent(s0, { type: 'abortive_draw', kind: 'threeRiichi', riichi: [0, 1, 2] }).ok).toBe(false);
    const on = withRules((r) => (r.draws.threeRiichi = true));
    const s = run([{ type: 'abortive_draw', kind: 'threeRiichi', riichi: [0, 1, 2] }], on);
    expect(s.deposits).toBe(3);
    expect(run([{ type: 'abortive_draw', kind: 'nineTerminals', riichi: [] }]).honba).toBe(1);
  });

  it('存在しない北席を含むイベントは拒否', () => {
    const r = applyEvent(initialState(rules, players), { type: 'chombo', seat: 3 });
    expect(r.ok).toBe(false);
  });
});

describe('3人打ちの精算', () => {
  it('35,000点持ち40,000点返し・ウマ+15/0/−15・オカ+15', () => {
    const r = computeSettlement([50000, 35000, 20000], rules);
    expect(r.rows.map((x) => [x.seat, x.rank, x.base, x.uma, x.oka, x.total])).toEqual([
      [0, 1, 10, 15, 15, 40],
      [1, 2, -5, 0, 0, -5],
      [2, 3, -20, -15, 0, -35],
    ]);
    expect(r.totalSum).toBe(0);
    expect(r.expectedTotal).toBe(105000);
  });
});

describe('ルール設定', () => {
  it('3人打ちの標準ルールは検証を通る', () => {
    expect(validateRuleProfile(DEFAULT_SANMA_RULES).ok).toBe(true);
  });
  it('矛盾を検出する（赤五萬・ウマの人数・トリロン）', () => {
    const bad = withRules((r) => {
      r.dora.aka.man = 1;
      r.settlement.uma = [30, 10, -10, -30];
      r.wins.multipleRon = 'tripleRon';
    });
    const v = validateRuleProfile(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.issues.map((i) => i.path).sort()).toEqual(['dora.aka.man', 'settlement.uma', 'wins.multipleRon']);
  });
  it('古い版の保存データ（3人打ちの項目が無い）を移行できる', () => {
    const old = structuredClone(DEFAULT_RULES) as Record<string, unknown>;
    delete old['sanma'];
    const draws = old['draws'] as Record<string, unknown>;
    delete draws['threeWinds'];
    delete draws['threeRiichi'];
    (old['game'] as Record<string, unknown>)['playerCount'] = 4;
    const v = validateRuleProfile(migrateRuleProfile(old));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.rules.settlement.uma).toEqual([30, 10, -10, -30]);
  });
});

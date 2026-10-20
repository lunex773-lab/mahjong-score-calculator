import { describe, expect, it } from 'vitest';
import { calculateHandScore } from '../../src/domain/mahjong/scoring';
import { DEFAULT_RULES, type RuleProfile } from '../../src/domain/rules';
import { meld, winInput, type WinSpec } from '../fixtures/hand-builder';

/*
 * 期待値は一般的な点数早見表（子: 30符1翻1000/2翻2000/3翻3900/4翻7700、親: 30符1翻1500 等）の値と照合している。
 * さらに tests/differential で独立実装（Python「mahjong」ライブラリ）とのランダム照合を行う。
 */

const rules = DEFAULT_RULES;
const score = (spec: WinSpec, r: RuleProfile = rules) => calculateHandScore(winInput(spec), r);
const yakuIds = (spec: WinSpec, r: RuleProfile = rules) => score(spec, r).yaku.map((y) => y.id).sort();
const withRules = (patch: (r: RuleProfile) => void): RuleProfile => {
  const copy = structuredClone(DEFAULT_RULES);
  patch(copy);
  return copy;
};

describe('基本の点数（子・親、ロン・ツモ）', () => {
  // 123m 456p 789s 23s + 55p、4s 待ち（1-4s 両面）
  const pinfuHand = { hand: '123m456p789s23s55p', win: '4s' };

  it('子 リーチ平和ロン 2翻30符 = 2000', () => {
    const r = score({ ...pinfuHand, flags: { riichi: true }, ura: '4z' });
    expect(r.valid).toBe(true);
    expect(r.yaku.map((y) => y.id).sort()).toEqual(['pinfu', 'riichi']);
    expect(r.fu.total).toBe(30);
    expect(r.han.totalHan).toBe(2);
    expect(r.winnerTotal).toBe(2000);
    expect(r.payments).toEqual([{ from: 2, to: 1, amount: 2000, kind: 'hand' }]);
  });

  it('子 リーチ平和ツモ 3翻20符 = 700/1300', () => {
    const r = score({ ...pinfuHand, method: 'tsumo', flags: { riichi: true }, ura: '4z' });
    expect(r.fu.total).toBe(20);
    expect(r.han.totalHan).toBe(3);
    const bySeat = Object.fromEntries(r.payments.map((p) => [p.from, p.amount]));
    expect(bySeat).toEqual({ 0: 1300, 2: 700, 3: 700 });
    expect(r.winnerTotal).toBe(2700);
  });

  it('親 リーチ平和ツモ 3翻20符 = 1300オール', () => {
    const r = score({ ...pinfuHand, method: 'tsumo', winner: 0, flags: { riichi: true }, ura: '4z' });
    expect(r.payments.map((p) => p.amount)).toEqual([1300, 1300, 1300]);
    expect(r.winnerTotal).toBe(3900);
  });

  it('親 平和ロン 1翻30符 = 1500', () => {
    const r = score({ ...pinfuHand, winner: 0 });
    expect(r.winnerTotal).toBe(1500);
  });

  it('子 七対子ロン 2翻25符 = 1600、ツモ 3翻25符 = 800/1600', () => {
    const chiitoi = { hand: '1155m2288p3399s6z', win: '6z' };
    expect(score(chiitoi).winnerTotal).toBe(1600);
    const t = score({ ...chiitoi, method: 'tsumo' });
    expect(t.fu.total).toBe(25);
    expect(t.payments.find((p) => p.from === 0)?.amount).toBe(1600);
    expect(t.payments.find((p) => p.from === 2)?.amount).toBe(800);
  });

  it('子 喰いタン 1翻30符 = 1000（副露手の20符形は30符）', () => {
    const r = score({
      hand: '567p345s67s88p',
      win: '8s',
      melds: [meld('chi', '234m', 0)],
    });
    expect(r.yaku.map((y) => y.id)).toEqual(['tanyao']);
    expect(r.fu.total).toBe(30);
    expect(r.fu.special).toContain('30符');
    expect(r.winnerTotal).toBe(1000);
  });

  it('子 40符1翻 = 1300 / 親 2000（暗刻・嵌張）', () => {
    // 中の暗刻(8) + 嵌張(2) + 門前ロン(10) + 副底20 = 40符、役牌中1翻
    const spec = { hand: '777z234m68p45699s', win: '7p' };
    const r = score(spec);
    expect(r.yaku.map((y) => y.id)).toEqual(['yakuhai-red']);
    expect(r.fu.total).toBe(40);
    expect(r.winnerTotal).toBe(1300);
    expect(score({ ...spec, winner: 0 }).winnerTotal).toBe(2000);
  });
});

describe('満貫以上・切り上げ満貫', () => {
  // 清一色 一気通貫: 1234567899m + 23m...
  it('30符4翻は 7700（切り上げ満貫なし）/ 8000（あり）', () => {
    // リーチ・平和・タンヤオ・ドラ1（ドラ表示牌 3m→4m）
    const spec: WinSpec = { hand: '234m456p678s34s88p', win: '5s', flags: { riichi: true }, dora: '3m', ura: '4z' };
    const r = score(spec);
    expect(r.han.totalHan).toBe(4);
    expect(r.fu.total).toBe(30);
    expect(r.winnerTotal).toBe(7700);
    const kiriage = score(spec, withRules((x) => (x.yaku.kiriageMangan = true)));
    expect(kiriage.winnerTotal).toBe(8000);
    expect(kiriage.limit).toBe('mangan');
  });

  it('子 倍満ロン 16000（清一色6・一気通貫2・平和1 = 9翻）', () => {
    const r = score({ hand: '1223344555678p', win: '9p' });
    expect(r.yaku.map((y) => y.id).sort()).toEqual(['chinitsu', 'ittsu', 'pinfu']);
    expect(r.han.totalHan).toBe(9);
    expect(r.limit).toBe('baiman');
    expect(r.winnerTotal).toBe(16000);
  });

  it('副露で翻数が下がる（清一色 6→5、一気通貫 2→1）', () => {
    const r = score({ hand: '1237899m', win: '9m', melds: [meld('chi', '456m', 0), meld('pon', '222m', 3)] });
    const names = Object.fromEntries(r.yaku.map((y) => [y.id, y.han]));
    expect(names['chinitsu']).toBe(5);
    expect(names['ittsu']).toBe(1);
    expect(r.limit).toBe('haneman');
    expect(r.winnerTotal).toBe(12000);
  });

  it('13翻以上は数え役満不採用なら三倍満、採用なら役満', () => {
    // 清一色 二盃口 断么九 平和 リーチ ドラ多数
    const spec: WinSpec = {
      hand: '2233445566778p',
      win: '8p',
      method: 'tsumo',
      flags: { riichi: true },
      dora: '1p',
      ura: '4z',
    };
    const r = score(spec);
    expect(r.han.totalHan).toBeGreaterThanOrEqual(13);
    expect(r.limit).toBe('sanbaiman');
    expect(r.winnerTotal).toBe(24000);
    const k = score(spec, withRules((x) => (x.yaku.kazoeYakuman = 'yakuman')));
    expect(k.limit).toBe('kazoe-yakuman');
    expect(k.winnerTotal).toBe(32000);
  });
});

describe('本場・供託', () => {
  const spec = { hand: '123m456p789s23s55p', win: '4s', flags: { riichi: true }, ura: '4z' } satisfies WinSpec;
  it('ロン: 2000点＋2本場600点＋供託2本', () => {
    const r = score({ ...spec, honba: 2, sticks: 2 });
    expect(r.honbaPayments).toEqual([{ from: 2, to: 1, amount: 600, kind: 'honba' }]);
    expect(r.riichiStickTransfer).toBe(2000);
    expect(r.winnerTotal).toBe(2000 + 600 + 2000);
  });
  it('ツモ: 各自 +100点/本場', () => {
    const r = score({ ...spec, method: 'tsumo', honba: 1 });
    expect(r.honbaPayments.map((p) => p.amount)).toEqual([100, 100, 100]);
    expect(r.winnerTotal).toBe(2700 + 300);
  });
});

describe('複数の分解候補と最高点法', () => {
  it('111222333m は三暗刻（50符2翻=3200）と一盃口平和（30符2翻=2000）を比較し高い方を採用', () => {
    const r = score({ hand: '111222333m55p78s', win: '9s' });
    expect(r.winningPatterns.length).toBeGreaterThanOrEqual(2);
    expect(r.yaku.map((y) => y.id)).toEqual(['sanankou']);
    expect(r.fu.total).toBe(50);
    expect(r.winnerTotal).toBe(3200);
  });

  it('アガリ牌の割当てで待ちが変わる: 3455s に 5s は両面（平和）と単騎を比較し高い方を採用', () => {
    const spec: WinSpec = { hand: '123m456m789p3455s', win: '5s', flags: { riichi: true }, ura: '4z' };
    const r = score(spec);
    expect(r.winningPatterns.map((p) => p.form === 'standard' && p.wait).sort()).toEqual(['ryanmen', 'tanki']);
    // 両面: リーチ平和 2翻30符=2000 ／ 単騎: リーチ 1翻40符=1300
    expect(r.yaku.map((y) => y.id).sort()).toEqual(['pinfu', 'riichi']);
    expect(r.winnerTotal).toBe(2000);
  });

  it('ロンで完成したシャンポンの刻子は明刻扱い（四暗刻ではなく三暗刻）', () => {
    const spec: WinSpec = { hand: '222m444p666s5577z', win: '7z' };
    const ron = score(spec);
    expect(ron.yakuman).toEqual([]);
    expect(ron.yaku.map((y) => y.id).sort()).toEqual(['sanankou', 'toitoi', 'yakuhai-red']);
    // 符: 副底20+門前ロン10+中張暗刻4×3+明刻中4+雀頭白2 = 50
    expect(ron.fu.total).toBe(50);
    const tsumo = score({ ...spec, method: 'tsumo' });
    expect(tsumo.yakuman.map((y) => y.yakuId)).toEqual(['suuankou']);
  });

  it('二盃口は一盃口を二重に加算しない、七対子とも重複しない', () => {
    const ids = yakuIds({ hand: '223344m556677p8s', win: '8s' });
    expect(ids).toContain('ryanpeikou');
    expect(ids).not.toContain('iipeikou');
    expect(ids).not.toContain('chiitoitsu');
  });
});

describe('役の判定', () => {
  it('役なしはドラがあってもエラー NO_YAKU', () => {
    const r = score({ hand: '123m456p789s11z77p', win: '7p', dora: '6p' });
    // 東(1z)の対子は雀頭、門前ロンで平和にもならない（シャンポン/単騎）
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.code).toBe('NO_YAKU');
  });

  it('喰いタンなしのルールでは副露タンヤオは役にならない', () => {
    const r = score(
      { hand: '567p345s678s8p', win: '8p', melds: [meld('chi', '234m', 0)] },
      withRules((x) => (x.yaku.openTanyao = false)),
    );
    expect(r.errors[0]?.code).toBe('NO_YAKU');
  });

  it('場風・自風・ダブ東', () => {
    // 東場・親(東席)の東 → 場風＋自風
    const ids = yakuIds({ hand: '111z234m567p78s99s', win: '9s', winner: 0, discarder: 1 });
    expect(ids).toEqual(['yakuhai-round-wind', 'yakuhai-seat-wind']);
  });

  it('連風牌の雀頭は設定で2符/4符', () => {
    const spec: WinSpec = { hand: '234m567p345s678s1z', win: '1z', winner: 0, discarder: 1, flags: { riichi: true }, ura: '4z' };
    const two = score(spec);
    expect(two.fu.items.find((i) => i.label.includes('雀頭'))?.fu).toBe(2);
    const four = score(spec, withRules((x) => (x.yaku.doubleWindPairFu = 4)));
    expect(four.fu.items.find((i) => i.label.includes('雀頭'))?.fu).toBe(4);
  });

  it('三色同順・一気通貫・混全帯・純全帯・混一色・対々和', () => {
    expect(yakuIds({ hand: '123m123p123s789m9p', win: '9p', flags: { riichi: true }, ura: '4z' })).toEqual(
      ['junchan', 'riichi', 'sanshoku'],
    );
    expect(yakuIds({ hand: '123456789m234p5s', win: '5s' })).toContain('ittsu');
    expect(yakuIds({ hand: '123m789p111z999s2z', win: '2z' })).toContain('chanta');
    expect(yakuIds({ hand: '123m789m111z5z678m', win: '5z' })).toEqual(expect.arrayContaining(['honitsu']));
    expect(
      yakuIds({ hand: '22244m55z', win: '4m', melds: [meld('pon', '777p', 0), meld('pon', '333s', 2)] }),
    ).toEqual(expect.arrayContaining(['toitoi']));
  });

  it('小三元・混老頭・三色同刻・三槓子', () => {
    expect(yakuIds({ hand: '555z666z77z123m99p', win: '9p' })).toEqual(
      expect.arrayContaining(['shousangen', 'yakuhai-white', 'yakuhai-green']),
    );
    expect(yakuIds({ hand: '111m999p11s99s', win: '9s', melds: [meld('pon', '222z', 0)] })).toEqual(
      ['honroutou', 'toitoi', 'yakuhai-seat-wind'],
    );
    expect(
      yakuIds({ hand: '333m333p34s88s', win: '5s', melds: [meld('pon', '333s', 0)] }),
    ).toEqual(expect.arrayContaining(['sanshoku-doukou']));
  });

  it('一発・ダブル立直・海底・河底・嶺上・槍槓', () => {
    const base = { hand: '123m456p789s23s55p', win: '4s', ura: '4z' } satisfies WinSpec;
    expect(yakuIds({ ...base, flags: { doubleRiichi: true, ippatsu: true } })).toEqual(
      ['double-riichi', 'ippatsu', 'pinfu'],
    );
    expect(yakuIds({ ...base, flags: { riichi: true, houtei: true } })).toContain('houtei');
    expect(yakuIds({ ...base, method: 'tsumo', flags: { riichi: true, haitei: true } })).toContain('haitei');
    expect(yakuIds({ ...base, flags: { riichi: true, chankan: true } })).toContain('chankan');
  });
});

describe('役満', () => {
  it('国士無双 親ロン 48000、十三面はダブル役満設定で 96000', () => {
    const single = score({ hand: '19m19p19s1234567z', win: '1m', winner: 0, discarder: 1 });
    expect(single.yakuman.map((y) => y.yakuId)).toEqual(['kokushi']);
    expect(single.winnerTotal).toBe(48000);
    const dbl = score(
      { hand: '19m19p19s1234567z', win: '1m', winner: 0, discarder: 1 },
      withRules((x) => (x.yaku.doubleYakuman.kokushi13 = true)),
    );
    expect(dbl.winnerTotal).toBe(96000);
  });

  it('四暗刻ツモ 子 8000/16000', () => {
    const r = score({ hand: '222m444p666s777z5z', win: '5z', method: 'tsumo' });
    expect(r.yakuman.map((y) => y.yakuId)).toEqual(['suuankou']);
    expect(r.winnerTotal).toBe(32000);
  });

  it('複合役満: 大三元＋字一色 = 2倍、複合しない設定では1倍', () => {
    const spec: WinSpec = { hand: '555z666z777z111z2z', win: '2z', method: 'tsumo' };
    const r = score(spec);
    expect(r.yakuman.map((y) => y.yakuId).sort()).toEqual(['daisangen', 'suuankou', 'tsuuiisou']);
    expect(r.winnerTotal).toBe(32000 * 3);
    const single = score(spec, withRules((x) => (x.yaku.yakumanStacking = 'single')));
    expect(single.winnerTotal).toBe(32000);
  });

  it('役満にはドラを加算しない', () => {
    const r = score({ hand: '222m444p666s777z5z', win: '5z', method: 'tsumo', dora: '1m' });
    expect(r.winnerTotal).toBe(32000);
  });

  it('緑一色（發なしでも成立、設定で發必須）', () => {
    const spec: WinSpec = { hand: '223344s666s888s4s', win: '4s', melds: [], method: 'tsumo' };
    expect(score(spec).yakuman.map((y) => y.yakuId)).toContain('ryuuiisou');
    const req = score(spec, withRules((x) => (x.yaku.ryuuiisouRequiresHatsu = true)));
    expect(req.yakuman.map((y) => y.yakuId)).not.toContain('ryuuiisou');
  });

  it('九蓮宝燈・清老頭・小四喜・大四喜・四槓子', () => {
    expect(score({ hand: '1112345678999m', win: '5m' }).yakuman.map((y) => y.yakuId)).toEqual(['chuuren']);
    expect(score({ hand: '111m999m111p999p1s', win: '1s', method: 'tsumo' }).yakuman.map((y) => y.yakuId)).toEqual(
      expect.arrayContaining(['chinroutou', 'suuankou']),
    );
    expect(score({ hand: '111z222z333z44z23m', win: '1m' }).yakuman.map((y) => y.yakuId)).toEqual(['shousuushii']);
    expect(
      score({ hand: '444z1m', win: '1m', melds: [meld('pon', '111z', 0), meld('pon', '222z', 2), meld('pon', '333z', 0)] })
        .yakuman.map((y) => y.yakuId),
    ).toEqual(['daisuushii']);
    expect(
      score({
        hand: '5p',
        win: '5p',
        melds: [meld('minkan', '1111m', 0), meld('ankan', '2222m'), meld('minkan', '3333p', 2), meld('kakan', '4444s', 3)],
        dora: '9s',
        kanDora: '1z2z3z4z',
      }).yakuman.map((y) => y.yakuId),
    ).toEqual(['suukantsu']);
  });

  it('天和・地和', () => {
    const hand = { hand: '123m456p789s23s55p', win: '4s', method: 'tsumo' as const };
    expect(score({ ...hand, winner: 0, flags: { tenhou: true } }).yakuman.map((y) => y.yakuId)).toEqual(['tenhou']);
    expect(score({ ...hand, winner: 1, flags: { chiihou: true } }).yakuman.map((y) => y.yakuId)).toEqual(['chiihou']);
    expect(score({ ...hand, winner: 1, flags: { tenhou: true } }).valid).toBe(false);
  });
});

describe('包（パオ）', () => {
  const daisangen: WinSpec = {
    hand: '777z123m9p',
    win: '9p',
    melds: [meld('pon', '555z', 2), meld('pon', '666z', 3)],
    pao: 3,
  };
  it('ツモ: 責任者が全額 32000', () => {
    const r = score({ ...daisangen, method: 'tsumo' });
    expect(r.payments).toEqual([{ from: 3, to: 1, amount: 32000, kind: 'pao' }]);
  });
  it('ロン: 放銃者と責任者で折半', () => {
    const r = score({ ...daisangen, method: 'ron', discarder: 0 });
    expect(r.payments).toEqual(
      expect.arrayContaining([
        { from: 0, to: 1, amount: 16000, kind: 'hand' },
        { from: 3, to: 1, amount: 16000, kind: 'pao' },
      ]),
    );
  });
  it('鳴かせていない人は責任者にできない', () => {
    const r = score({ ...daisangen, method: 'tsumo', pao: 0 });
    expect(r.errors[0]?.code).toBe('INVALID_RESPONSIBILITY_PAYMENT');
  });
  it('包が成立しなければ通常の支払い', () => {
    const { pao: _p, ...noPao } = daisangen;
    const r = score({ ...noPao, method: 'tsumo' });
    expect(r.payments.map((p) => p.amount).sort((a, b) => a - b)).toEqual([8000, 8000, 16000]);
  });
});

describe('ドラ', () => {
  it('表示牌の次の牌を数える（9→1、北→東、中→白）', () => {
    const r = score({ hand: '123m456p789s23s11p', win: '4s', dora: '9p', flags: { riichi: true }, ura: '4z' });
    // 9p→1p ×2、裏 北→東 ×0
    const d = Object.fromEntries(r.dora.map((x) => [x.type, x.count]));
    expect(d).toMatchObject({ dora: 2, ura: 0, aka: 0 });
  });
  it('赤ドラを数える', () => {
    const r = score({ hand: '123m406p789s23s55s', win: '4s', flags: { riichi: true }, ura: '4z' });
    expect(r.dora.find((d) => d.type === 'aka')?.count).toBe(1);
  });
});

describe('入力検証', () => {
  it('枚数不足', () => {
    expect(score({ hand: '123m456p789s23s5p', win: '4s' }).errors[0]?.code).toBe('INVALID_TILE_COUNT');
  });
  it('同じ牌が5枚以上', () => {
    expect(score({ hand: '1111m456p789s23s5p', win: '1m' }).errors.map((e) => e.code)).toContain('INVALID_TILE_COPIES');
  });
  it('赤牌の枚数超過・赤なしルール', () => {
    expect(score({ hand: '123m406p789s23s00s', win: '4s' }).errors.map((e) => e.code)).toContain('INVALID_TILE_COPIES');
    const noAka = withRules((x) => (x.dora.aka = { man: 0, pin: 0, sou: 0 }));
    expect(score({ hand: '123m406p789s23s55s', win: '4s', flags: { riichi: true }, ura: '4z' }, noAka).valid).toBe(false);
  });
  it('アガリ形でない', () => {
    expect(score({ hand: '123m456p789s24s55p', win: '7s' }).errors[0]?.code).toBe('INVALID_HAND_STRUCTURE');
  });
  it('副露ありのリーチは不可', () => {
    expect(
      score({ hand: '567p345s678s8p', win: '8p', melds: [meld('chi', '234m', 0)], flags: { riichi: true } }).errors.map(
        (e) => e.code,
      ),
    ).toContain('INVALID_RIICHI_STATE');
  });
  it('チーは上家からのみ', () => {
    expect(
      score({ hand: '567p345s678s8p', win: '8p', melds: [meld('chi', '234m', 2)] }).errors.map((e) => e.code),
    ).toContain('INVALID_MELD');
  });
  it('フリテンのロンは不可、未確認なら警告', () => {
    const spec = { hand: '123m456p789s23s55p', win: '4s' };
    expect(score({ ...spec, furiten: 'yes' }).errors[0]?.code).toBe('INVALID_FURITEN_STATE');
    expect(score({ ...spec, furiten: 'unknown' }).warnings[0]?.code).toBe('FURITEN_UNCONFIRMED');
    expect(score({ ...spec, method: 'tsumo', furiten: 'yes' }).valid).toBe(true);
  });
  it('リーチ時は裏ドラ表示牌が必要、リーチなしでは入力不可', () => {
    const spec = { hand: '123m456p789s23s55p', win: '4s' };
    expect(score({ ...spec, flags: { riichi: true } }).errors[0]?.code).toBe('INVALID_DORA_INDICATOR');
    expect(score({ ...spec, ura: '1z' }).errors[0]?.code).toBe('INVALID_DORA_INDICATOR');
  });
  it('ツモで海底・ロンで河底のみ', () => {
    const spec = { hand: '123m456p789s23s55p', win: '4s' };
    expect(score({ ...spec, flags: { haitei: true } }).valid).toBe(false);
    expect(score({ ...spec, method: 'tsumo', flags: { houtei: true } }).valid).toBe(false);
  });
  it('国士無双の暗槓槍槓は国士のみ', () => {
    expect(score({ hand: '19m19p19s1234567z', win: '1m', flags: { chankan: true, chankanOnConcealedKan: true } }).valid).toBe(
      true,
    );
    expect(
      score({ hand: '123m456p789s23s55p', win: '4s', flags: { chankan: true, chankanOnConcealedKan: true } }).valid,
    ).toBe(false);
  });
});

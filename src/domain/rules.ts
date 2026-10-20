import { z } from 'zod';

/**
 * ルールプロファイル（4人打ち仕様書 第16章・3人打ち仕様書 第12章）。
 * 計算エンジンはこの設定値だけを参照し、ルール差のある値をコードへ直接埋め込まない。
 * 4人打ちと3人打ちは同じ形のプロファイルで表し、人数（game.playerCount）で切り替える。
 */

const nonNegInt = z.number().int().min(0);

export const ruleProfileSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),

  game: z.object({
    /** 4 = 4人打ち、3 = 3人打ち（三人麻雀） */
    playerCount: z.union([z.literal(3), z.literal(4)]),
    /** east = 東風戦, hanchan = 東南戦 */
    length: z.enum(['east', 'hanchan']),
    startingPoints: z.number().int().positive(),
    returnPoints: z.number().int().positive(),
    /** 持ち点が0点未満になったら終了 */
    bustStop: z.boolean(),
    /** オーラスで親がトップならアガリやめを選べる */
    agariYame: z.boolean(),
    /** オーラスで親がトップならテンパイやめを選べる */
    tenpaiYame: z.boolean(),
    /** 半荘終了時に残った供託: top = トップが取得 / none = 誰も取得しない */
    leftoverDeposit: z.enum(['top', 'none']),
  }),

  yaku: z.object({
    openTanyao: z.boolean(),
    kiriageMangan: z.boolean(),
    /** none = 13翻以上も三倍満, yakuman = 13翻以上を役満 */
    kazoeYakuman: z.enum(['none', 'yakuman']),
    /** 連風牌の雀頭の符 */
    doubleWindPairFu: z.union([z.literal(2), z.literal(4)]),
    /** 複合役満: multiple = 成立した役満の数だけ加算, single = 1倍に固定 */
    yakumanStacking: z.enum(['single', 'multiple']),
    doubleYakuman: z.object({
      daisuushii: z.boolean(),
      suuankouTanki: z.boolean(),
      kokushi13: z.boolean(),
      chuuren9: z.boolean(),
    }),
    ryuuiisouRequiresHatsu: z.boolean(),
    renhou: z.enum(['none', 'mangan', 'yakuman']),
  }),

  dora: z.object({
    aka: z.object({ man: nonNegInt.max(4), pin: nonNegInt.max(4), sou: nonNegInt.max(4) }),
    ura: z.boolean(),
    kan: z.boolean(),
    kanUra: z.boolean(),
  }),

  wins: z.object({
    /** headBump = 頭ハネ, doubleRon = ダブロンまで, tripleRon = トリロンまで（4人打ちのみ） */
    multipleRon: z.enum(['headBump', 'doubleRon', 'tripleRon']),
    /** 複数ロン時の本場・供託: nearest = 放銃者から見て下家側に近いアガリ者が取る, each = 本場は全員（供託は近い者） */
    multipleRonHonba: z.enum(['nearest', 'each']),
    /** 国士無双に限り暗槓を槍槓できる */
    kokushiRobConcealedKan: z.boolean(),
  }),

  /** 3人打ち専用の設定（4人打ちでは使わない） */
  sanma: z.object({
    /**
     * ツモの支払い方:
     * split = 4人打ちなら北家が払う分を残る2人で折半（ツモでもロンと同じ合計）
     * loss  = 4人打ちと同じ額を2人が払い、北家の分は払われない（ツモ損）
     */
    tsumoPayment: z.enum(['split', 'loss']),
    /** 北抜き（抜いた北を抜きドラとして数える） */
    nukiDora: z.boolean(),
    /** 手牌の北の刻子を役牌として扱う */
    northYakuhai: z.boolean(),
    /** チーを認める */
    allowChi: z.boolean(),
  }),

  draws: z.object({
    nineTerminals: z.boolean(),
    /** 4人打ち: 四風子連打 */
    fourWinds: z.boolean(),
    /** 4人打ち: 四家立直 */
    fourRiichi: z.boolean(),
    /** 四槓散了（2人以上で合計4回の槓） */
    fourKans: z.boolean(),
    /** 4人打ち: 三家和を途中流局とする */
    threeRon: z.boolean(),
    /** 3人打ち: 三風子連打 */
    threeWinds: z.boolean(),
    /** 3人打ち: 三家立直を途中流局とする */
    threeRiichi: z.boolean(),
    nagashiMangan: z.boolean(),
    notenPenaltyTotal: nonNegInt,
  }),

  pao: z.object({
    daisangen: z.boolean(),
    daisuushii: z.boolean(),
    suukantsu: z.boolean(),
  }),

  settlement: z.object({
    honbaRon: nonNegInt,
    honbaTsumoEach: nonNegInt,
    riichiStick: z.number().int().positive(),
    /** 1位から順の順位点（千点単位）。人数と同じ個数 */
    uma: z.array(z.number()).min(3).max(4),
    okaEnabled: z.boolean(),
    /** 同点時: seatOrder = 起家に近い方が上位, split = 順位点を等分 */
    tieBreak: z.enum(['seatOrder', 'split']),
  }),

  chombo: z.object({
    /** mangan = 満貫払い（ツモの支払い方に合わせて親・子へ支払う） */
    mode: z.literal('mangan'),
  }),
});

export type RuleProfile = z.infer<typeof ruleProfileSchema>;
export type PlayerCount = RuleProfile['game']['playerCount'];

const SANMA_OFF: RuleProfile['sanma'] = { tsumoPayment: 'split', nukiDora: true, northYakuhai: false, allowChi: false };

export const DEFAULT_RULES: RuleProfile = {
  id: 'jp-riichi-standard-v1',
  version: '1.1.0',
  name: '4人打ち標準ルール',
  game: {
    playerCount: 4,
    length: 'hanchan',
    startingPoints: 30000,
    returnPoints: 30000,
    bustStop: true,
    agariYame: true,
    tenpaiYame: true,
    leftoverDeposit: 'top',
  },
  yaku: {
    openTanyao: true,
    kiriageMangan: false,
    kazoeYakuman: 'none',
    doubleWindPairFu: 2,
    yakumanStacking: 'multiple',
    doubleYakuman: { daisuushii: false, suuankouTanki: false, kokushi13: false, chuuren9: false },
    ryuuiisouRequiresHatsu: false,
    renhou: 'none',
  },
  dora: { aka: { man: 1, pin: 1, sou: 1 }, ura: true, kan: true, kanUra: true },
  wins: { multipleRon: 'doubleRon', multipleRonHonba: 'nearest', kokushiRobConcealedKan: true },
  sanma: SANMA_OFF,
  draws: {
    nineTerminals: true,
    fourWinds: true,
    fourRiichi: true,
    fourKans: true,
    threeRon: true,
    threeWinds: false,
    threeRiichi: false,
    nagashiMangan: true,
    notenPenaltyTotal: 3000,
  },
  pao: { daisangen: true, daisuushii: true, suukantsu: false },
  settlement: {
    honbaRon: 300,
    honbaTsumoEach: 100,
    riichiStick: 1000,
    uma: [30, 10, -10, -30],
    okaEnabled: true,
    tieBreak: 'seatOrder',
  },
  chombo: { mode: 'mangan' },
};

/**
 * 3人打ちの標準ルール（3人打ち仕様書 0.3 の初期プロファイル）。
 * ツモの支払いは北家分の折半、北は抜きドラ専用（手牌の北は役牌にしない）、チーなし。
 */
export const DEFAULT_SANMA_RULES: RuleProfile = {
  ...DEFAULT_RULES,
  id: 'jp-sanma-standard-v1',
  version: '1.0.0',
  name: '3人打ち標準ルール',
  game: { ...DEFAULT_RULES.game, playerCount: 3, startingPoints: 35000, returnPoints: 40000 },
  dora: { ...DEFAULT_RULES.dora, aka: { man: 0, pin: 1, sou: 1 } },
  wins: { ...DEFAULT_RULES.wins, multipleRon: 'doubleRon' },
  sanma: { tsumoPayment: 'split', nukiDora: true, northYakuhai: false, allowChi: false },
  draws: {
    nineTerminals: true,
    fourWinds: false,
    fourRiichi: false,
    fourKans: true,
    threeRon: false,
    threeWinds: false,
    threeRiichi: false,
    nagashiMangan: true,
    notenPenaltyTotal: 2000,
  },
  settlement: { ...DEFAULT_RULES.settlement, honbaTsumoEach: 150, uma: [15, 0, -15] },
};

export const defaultRulesFor = (n: PlayerCount): RuleProfile => (n === 3 ? DEFAULT_SANMA_RULES : DEFAULT_RULES);

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function mergeDefaults(base: unknown, raw: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(raw)) return raw === undefined ? base : raw;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(raw)) out[k] = mergeDefaults(base[k], v);
  return out;
}

/**
 * 保存済みのルール（古い版）を現在の形に移行する。足りない項目は同じ人数の標準ルールの値で補う。
 * 既存の値は変更しないため、過去の対局の計算結果は変わらない。
 */
export function migrateRuleProfile(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;
  const game = isPlainObject(raw['game']) ? raw['game'] : {};
  const n = game['playerCount'] === 3 ? 3 : 4;
  return mergeDefaults(defaultRulesFor(n), raw);
}

export interface RuleProfileIssue {
  path: string;
  message: string;
}

/** 設定の保存前検証（仕様書 16.2）。矛盾があれば計算前に検出する。 */
export function validateRuleProfile(input: unknown): { ok: true; rules: RuleProfile } | { ok: false; issues: RuleProfileIssue[] } {
  const parsed = ruleProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const rules = parsed.data;
  const n = rules.game.playerCount;
  const issues: RuleProfileIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (rules.game.returnPoints < rules.game.startingPoints) add('game.returnPoints', '返し点は開始持ち点以上にしてください。');
  if (rules.settlement.uma.length !== n) add('settlement.uma', `順位点は${n}人分を設定してください。`);
  const umaSum = rules.settlement.uma.reduce((a, b) => a + b, 0);
  if (Math.abs(umaSum) > 1e-9) add('settlement.uma', `順位点の合計が0になりません（合計 ${umaSum}）。`);
  if (rules.settlement.uma.some((v, i, arr) => i > 0 && v > (arr[i - 1] as number))) {
    add('settlement.uma', '順位点は上位ほど大きくしてください。');
  }

  if (n === 4) {
    if (rules.wins.multipleRon === 'tripleRon' && rules.draws.threeRon) {
      add('draws.threeRon', 'トリロンを認める設定と三家和流局は同時に採用できません。');
    }
    if (rules.wins.multipleRon === 'doubleRon' && !rules.draws.threeRon) {
      add('draws.threeRon', 'ダブロンまでの設定では、3人ロン時の処理（三家和流局）を有効にしてください。');
    }
    if (rules.draws.threeWinds || rules.draws.threeRiichi) {
      add('draws', '三風子連打・三家立直は3人打ち専用の設定です。');
    }
  } else {
    // 3人打ちでは放銃者以外の2人までしかロンできないため、トリロン・三家和は起こらない
    if (rules.wins.multipleRon === 'tripleRon') add('wins.multipleRon', '3人打ちではトリロンは起こりません（ダブロンか頭ハネを選んでください）。');
    if (rules.draws.threeRon || rules.draws.fourWinds || rules.draws.fourRiichi) {
      add('draws', '三家和・四風子連打・四家立直は4人打ち専用の設定です。');
    }
    if (rules.dora.aka.man > 0) add('dora.aka.man', '3人打ちでは五萬を使わないため、赤五萬は設定できません。');
  }

  if (!rules.dora.ura && rules.dora.kanUra) add('dora.kanUra', '裏ドラなしで槓裏ドラのみを採用することはできません。');
  if (!rules.dora.kan && rules.dora.kanUra) add('dora.kanUra', '槓ドラなしで槓裏ドラのみを採用することはできません。');
  if (rules.game.tenpaiYame && !rules.game.agariYame) add('game.tenpaiYame', 'テンパイやめはアガリやめと併せて採用してください。');

  // テンパイ人数（1〜n−1人）のどの場合でも、罰符を割り切れる額にする
  const divisors = Array.from({ length: n - 1 }, (_, i) => i + 1).flatMap((k) => [k, n - k]);
  if (divisors.some((d) => rules.draws.notenPenaltyTotal % d !== 0)) {
    add(
      'draws.notenPenaltyTotal',
      `ノーテン罰符の総額は、テンパイ・ノーテンの人数（1〜${n - 1}人）で割り切れる額にしてください。`,
    );
  }
  if (rules.settlement.riichiStick % 100 !== 0) add('settlement.riichiStick', 'リーチ棒は100点単位にしてください。');
  return issues.length > 0 ? { ok: false, issues } : { ok: true, rules };
}

import { z } from 'zod';

/**
 * ルールプロファイル（仕様書 第16章）。
 * 計算エンジンはこの設定値だけを参照し、ルール差のある値をコードへ直接埋め込まない。
 */

const nonNegInt = z.number().int().min(0);

export const ruleProfileSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),

  game: z.object({
    playerCount: z.literal(4),
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
    /** headBump = 頭ハネ, doubleRon = ダブロンまで, tripleRon = トリロンまで */
    multipleRon: z.enum(['headBump', 'doubleRon', 'tripleRon']),
    /** 複数ロン時の本場・供託: nearest = 放銃者から見て下家側に近いアガリ者が取る, each = 本場は全員（供託は近い者） */
    multipleRonHonba: z.enum(['nearest', 'each']),
    /** 国士無双に限り暗槓を槍槓できる */
    kokushiRobConcealedKan: z.boolean(),
  }),

  draws: z.object({
    nineTerminals: z.boolean(),
    fourWinds: z.boolean(),
    fourRiichi: z.boolean(),
    fourKans: z.boolean(),
    /** 三家和を途中流局とする */
    threeRon: z.boolean(),
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
    /** 1位〜4位の順位点（千点単位） */
    uma: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    okaEnabled: z.boolean(),
    /** 同点時: seatOrder = 起家に近い方が上位, split = 順位点を等分 */
    tieBreak: z.enum(['seatOrder', 'split']),
  }),

  chombo: z.object({
    /** mangan = 満貫払い（親は4000オール相当、子は親4000・子2000） */
    mode: z.literal('mangan'),
  }),
});

export type RuleProfile = z.infer<typeof ruleProfileSchema>;

export const DEFAULT_RULES: RuleProfile = {
  id: 'jp-riichi-standard-v1',
  version: '1.0.0',
  name: '標準ルール（30000点持ち・ウマ15-30）',
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
  draws: {
    nineTerminals: true,
    fourWinds: true,
    fourRiichi: true,
    fourKans: true,
    threeRon: true,
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
  const issues: RuleProfileIssue[] = [];

  if (rules.game.returnPoints < rules.game.startingPoints) {
    issues.push({ path: 'game.returnPoints', message: '返し点は開始持ち点以上にしてください' });
  }
  const umaSum = rules.settlement.uma.reduce((a, b) => a + b, 0);
  if (Math.abs(umaSum) > 1e-9) {
    issues.push({ path: 'settlement.uma', message: `順位点の合計が0になりません（合計 ${umaSum}）` });
  }
  if (rules.settlement.uma.some((v, i, arr) => i > 0 && v > (arr[i - 1] as number))) {
    issues.push({ path: 'settlement.uma', message: '順位点は上位ほど大きくしてください' });
  }
  if (rules.wins.multipleRon === 'tripleRon' && rules.draws.threeRon) {
    issues.push({ path: 'draws.threeRon', message: 'トリロンを認める設定と三家和流局は同時に採用できません' });
  }
  if (rules.wins.multipleRon === 'doubleRon' && !rules.draws.threeRon) {
    issues.push({
      path: 'draws.threeRon',
      message: 'ダブロンまでの設定では、3人ロン時の処理（三家和流局）を有効にしてください',
    });
  }
  if (!rules.dora.ura && rules.dora.kanUra) {
    issues.push({ path: 'dora.kanUra', message: '裏ドラなしで槓裏ドラのみを採用することはできません' });
  }
  if (!rules.dora.kan && rules.dora.kanUra) {
    issues.push({ path: 'dora.kanUra', message: '槓ドラなしで槓裏ドラのみを採用することはできません' });
  }
  if (rules.game.tenpaiYame && !rules.game.agariYame) {
    issues.push({ path: 'game.tenpaiYame', message: 'テンパイやめはアガリやめと併せて採用してください' });
  }
  if (rules.draws.notenPenaltyTotal % 3 !== 0 || rules.draws.notenPenaltyTotal % 2 !== 0) {
    issues.push({
      path: 'draws.notenPenaltyTotal',
      message: 'ノーテン罰符の総額は1人・2人・3人で割り切れる額（6の倍数）にしてください',
    });
  }
  if (rules.settlement.riichiStick % 100 !== 0) {
    issues.push({ path: 'settlement.riichiStick', message: 'リーチ棒は100点単位にしてください' });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, rules };
}

import { userError, type RuleError } from '../errors';
import type { RuleProfile } from '../rules';
import { kamichaOf, MELD_LABELS, type Meld, type Seat, type WinInput } from './hand';
import { COPIES_PER_KIND, isValidKind, KIND_COUNT, rankOf, suitOf, tileLabel, type Tile } from './tile';

/** 1つの副露が面子として成立しているか（仕様書 3.1）。 */
export function validateMeld(meld: Meld, owner: Seat): RuleError[] {
  const errors: RuleError[] = [];
  const label = MELD_LABELS[meld.type];
  const tiles = meld.tiles;
  const need = meld.type === 'chi' || meld.type === 'pon' ? 3 : 4;
  if (tiles.length !== need) {
    return [userError('INVALID_MELD', `${label}は${need}枚で構成してください（現在${tiles.length}枚）`)];
  }
  if (tiles.some((t) => !isValidKind(t.kind))) {
    return [userError('INVALID_MELD', `${label}に不正な牌が含まれています`)];
  }
  if (meld.type === 'chi') {
    const kinds = tiles.map((t) => t.kind).sort((a, b) => a - b);
    const [a, b, c] = kinds as [number, number, number];
    const sameSuit = suitOf(a) !== 'honor' && suitOf(a) === suitOf(c);
    if (!sameSuit || b !== a + 1 || c !== a + 2) {
      errors.push(userError('INVALID_MELD', 'チーは同じ種類の数牌3枚の連続した並びにしてください'));
    }
    if (meld.calledFrom !== undefined && meld.calledFrom !== kamichaOf(owner)) {
      errors.push(userError('INVALID_MELD', 'チーは上家の捨て牌からしかできません'));
    }
  } else {
    const kind = tiles[0]?.kind;
    if (!tiles.every((t) => t.kind === kind)) {
      errors.push(userError('INVALID_MELD', `${label}は同じ牌で構成してください`));
    }
  }
  if (meld.type === 'ankan') {
    if (meld.calledFrom !== undefined) errors.push(userError('INVALID_MELD', '暗槓に鳴き元は設定できません'));
  } else {
    if (meld.calledFrom === undefined) {
      errors.push(userError('INVALID_MELD', `${label}の鳴き元（誰から鳴いたか）を設定してください`));
    } else if (meld.calledFrom === owner) {
      errors.push(userError('INVALID_MELD', `${label}の鳴き元に自分自身は設定できません`));
    }
  }
  return errors;
}

/** 牌の物理的枚数の検証（仕様書 2.4）。赤牌は通常牌の内数として扱う。 */
export function validateTileCopies(tiles: readonly Tile[], rules: RuleProfile, where = '入力'): RuleError[] {
  const errors: RuleError[] = [];
  const counts = new Array<number>(KIND_COUNT).fill(0);
  const redCounts = new Array<number>(KIND_COUNT).fill(0);
  for (const t of tiles) {
    if (!isValidKind(t.kind)) {
      errors.push(userError('INVALID_TILE_COPIES', '不正な牌が含まれています'));
      continue;
    }
    counts[t.kind] = (counts[t.kind] ?? 0) + 1;
    if (t.red) {
      if (rankOf(t.kind) !== 5) {
        errors.push(userError('INVALID_TILE_COPIES', '赤牌は五の数牌だけです'));
        continue;
      }
      redCounts[t.kind] = (redCounts[t.kind] ?? 0) + 1;
    }
  }
  const akaLimit = (kind: number): number => {
    const suit = suitOf(kind);
    if (suit === 'honor') return 0;
    return rules.dora.aka[suit];
  };
  for (let k = 0; k < KIND_COUNT; k++) {
    const c = counts[k] ?? 0;
    if (c > COPIES_PER_KIND) {
      errors.push(
        userError('INVALID_TILE_COPIES', `${where}に「${tileLabel(k)}」が${c}枚あります（同じ牌は4枚まで）`),
      );
    }
    const red = redCounts[k] ?? 0;
    const limit = akaLimit(k);
    if (red > limit) {
      errors.push(
        userError(
          'INVALID_TILE_COPIES',
          limit === 0
            ? `現在のルールでは「${tileLabel({ kind: k, red: true })}」は使用しません`
            : `「${tileLabel({ kind: k, red: true })}」は${limit}枚までです（${red}枚入力されています）`,
        ),
      );
    }
    if (rankOf(k) === 5 && c - red > COPIES_PER_KIND - limit) {
      errors.push(
        userError(
          'INVALID_TILE_COPIES',
          `通常の「${tileLabel(k)}」は${COPIES_PER_KIND - limit}枚までです（赤${limit}枚を含めて4枚）`,
        ),
      );
    }
  }
  return errors;
}

/** アガリ入力の構造・場況の検証（設計書 5.4）。役判定の前に実行する。 */
export function validateWinInput(input: WinInput, rules: RuleProfile): RuleError[] {
  const errors: RuleError[] = [];
  const { melds } = input;

  // 牌の総数: 槓子は手牌構造上3枚として数える
  const structural = input.concealed.length + 1 + melds.length * 3;
  if (structural !== 14) {
    const expected = 13 - melds.length * 3;
    errors.push(
      userError(
        'INVALID_TILE_COUNT',
        `手牌は副露${melds.length}組のとき${expected}枚＋アガリ牌1枚にしてください（現在、手牌${input.concealed.length}枚）`,
        'concealed',
      ),
    );
  }
  if (melds.length > 4) errors.push(userError('INVALID_MELD', '副露は4組までです', 'melds'));
  melds.forEach((m) => errors.push(...validateMeld(m, input.winner)));
  if (!isValidKind(input.winningTile.kind)) {
    errors.push(userError('INVALID_WINNING_TILE', 'アガリ牌を設定してください', 'winningTile'));
  }

  const handTiles = [...input.concealed, input.winningTile, ...melds.flatMap((m) => m.tiles)];
  const allTiles = [
    ...handTiles,
    ...input.dora.dora,
    ...input.dora.kanDora,
    ...input.dora.ura,
    ...input.dora.kanUra,
  ];
  errors.push(...validateTileCopies(allTiles, rules, '手牌とドラ表示牌'));

  errors.push(...validateDora(input, rules));
  errors.push(...validateWinContext(input, rules));
  return errors;
}

function validateDora(input: WinInput, rules: RuleProfile): RuleError[] {
  const errors: RuleError[] = [];
  const { dora } = input;
  const err = (msg: string, field: string) => errors.push(userError('INVALID_DORA_INDICATOR', msg, field));
  const ownKans = input.melds.filter((m) => m.type !== 'chi' && m.type !== 'pon').length;
  const riichi = input.flags.riichi || input.flags.doubleRiichi;

  if (dora.dora.length === 0) err('ドラ表示牌を入力してください（ドラが無い場合も表示牌は必ず1枚あります）', 'dora');
  if (dora.dora.length > 1) err('表ドラ表示牌は1枚です（槓ドラは槓ドラ欄に入力してください）', 'dora');
  if (dora.kanDora.length > 4) err('槓ドラ表示牌は4枚までです', 'kanDora');
  if (!rules.dora.kan && dora.kanDora.length > 0) err('現在のルールでは槓ドラを採用していません', 'kanDora');
  // 他家の槓は入力されない場合があるため、アガリ者自身の槓の数だけを下限として確認する
  if (rules.dora.kan && ownKans > dora.kanDora.length) {
    err(`アガった人が${ownKans}回槓しているので、槓ドラ表示牌を${ownKans}枚以上入力してください`, 'kanDora');
  }

  if (!riichi) {
    if (dora.ura.length > 0 || dora.kanUra.length > 0) {
      err('裏ドラはリーチしたときだけ有効です。裏ドラ表示牌を外してください', 'ura');
    }
    return errors;
  }
  if (!rules.dora.ura) {
    if (dora.ura.length > 0 || dora.kanUra.length > 0) err('現在のルールでは裏ドラを採用していません', 'ura');
    return errors;
  }
  if (dora.ura.length !== dora.dora.length) err('リーチしているので裏ドラ表示牌を1枚入力してください', 'ura');
  if (rules.dora.kanUra && rules.dora.kan) {
    if (dora.kanUra.length !== dora.kanDora.length) {
      err(`槓裏ドラ表示牌を槓ドラ表示牌と同じ${dora.kanDora.length}枚入力してください`, 'kanUra');
    }
  } else if (dora.kanUra.length > 0) {
    err('現在のルールでは槓裏ドラを採用していません', 'kanUra');
  }
  return errors;
}

/** アガリ方法と場況の整合性（設計書 4.2「矛盾が発生しないよう制御」）。 */
function validateWinContext(input: WinInput, rules: RuleProfile): RuleError[] {
  const errors: RuleError[] = [];
  const { flags, method, melds, winner, dealer } = input;
  const ctx = (msg: string, field?: string) => errors.push(userError('INVALID_WIN_CONTEXT', msg, field));
  const hasOpenMeld = melds.some((m) => m.type !== 'ankan');
  const hasKan = melds.some((m) => m.type === 'minkan' || m.type === 'kakan' || m.type === 'ankan');

  if (method === 'ron') {
    if (input.discarder === undefined) ctx('ロンの場合は放銃者（誰の捨て牌でアガったか）を選んでください', 'discarder');
    else if (input.discarder === winner) ctx('放銃者にアガった本人は選べません', 'discarder');
  } else if (input.discarder !== undefined) {
    ctx('ツモアガリでは放銃者を設定できません', 'discarder');
  }

  if (flags.riichi && flags.doubleRiichi) {
    errors.push(userError('INVALID_RIICHI_STATE', 'リーチとダブルリーチはどちらか一方を選んでください', 'riichi'));
  }
  if ((flags.riichi || flags.doubleRiichi) && hasOpenMeld) {
    errors.push(userError('INVALID_RIICHI_STATE', '副露（暗槓以外）がある手ではリーチできません', 'riichi'));
  }
  if (flags.ippatsu && !(flags.riichi || flags.doubleRiichi)) {
    ctx('一発はリーチしているときだけ成立します', 'ippatsu');
  }
  if (flags.rinshan) {
    if (method !== 'tsumo') ctx('嶺上開花はツモアガリのときだけ成立します', 'rinshan');
    if (!hasKan) ctx('嶺上開花には、アガった人自身の槓が必要です', 'rinshan');
  }
  if (flags.chankan) {
    if (method !== 'ron') ctx('槍槓はロンアガリのときだけ成立します', 'chankan');
    if (flags.rinshan) ctx('槍槓と嶺上開花は同時に成立しません', 'chankan');
    if (flags.haitei || flags.houtei) ctx('槍槓と海底・河底は同時に成立しません', 'chankan');
  }
  if (flags.chankanOnConcealedKan) {
    if (!flags.chankan) ctx('暗槓への槍槓を選ぶ場合は槍槓も選んでください', 'chankan');
    if (!rules.wins.kokushiRobConcealedKan) ctx('現在のルールでは暗槓に対する槍槓（国士無双）を認めていません', 'chankan');
  }
  if (flags.haitei) {
    if (method !== 'tsumo') ctx('海底摸月はツモアガリのときだけ成立します（ロンは河底撈魚）', 'haitei');
    if (flags.rinshan) ctx('嶺上牌でのアガリは海底摸月になりません', 'haitei');
  }
  if (flags.houtei && method !== 'ron') ctx('河底撈魚はロンアガリのときだけ成立します（ツモは海底摸月）', 'houtei');

  const firstTurnFlags = flags.tenhou || flags.chiihou || flags.renhou;
  if (firstTurnFlags) {
    if (melds.length > 0) ctx('天和・地和・人和は副露・槓がある手では成立しません');
    if (flags.riichi || flags.doubleRiichi) ctx('天和・地和・人和とリーチは同時に成立しません');
    if (flags.ippatsu || flags.rinshan || flags.chankan || flags.haitei || flags.houtei) {
      ctx('天和・地和・人和と一発・嶺上・槍槓・海底・河底は同時に成立しません');
    }
  }
  if (flags.tenhou) {
    if (winner !== dealer) ctx('天和は親だけが成立します（子は地和）', 'tenhou');
    if (method !== 'tsumo') ctx('天和はツモアガリのときだけ成立します', 'tenhou');
  }
  if (flags.chiihou) {
    if (winner === dealer) ctx('地和は子だけが成立します（親は天和）', 'chiihou');
    if (method !== 'tsumo') ctx('地和はツモアガリのときだけ成立します', 'chiihou');
  }
  if (flags.renhou) {
    if (rules.yaku.renhou === 'none') ctx('現在のルールでは人和を採用していません', 'renhou');
    if (winner === dealer) ctx('人和は子だけが成立します', 'renhou');
    if (method !== 'ron') ctx('人和はロンアガリのときだけ成立します', 'renhou');
  }
  if ([flags.tenhou, flags.chiihou, flags.renhou].filter(Boolean).length > 1) {
    ctx('天和・地和・人和は同時に選べません');
  }

  if (input.furiten === 'yes' && method === 'ron') {
    errors.push(userError('INVALID_FURITEN_STATE', 'フリテンの状態ではロンアガリできません（ツモアガリは可能です）', 'furiten'));
  }

  if (!Number.isInteger(input.honba) || input.honba < 0) {
    errors.push(userError('INVALID_ROUND_STATE', '本場は0以上の整数にしてください', 'honba'));
  }
  if (!Number.isInteger(input.riichiSticks) || input.riichiSticks < 0) {
    errors.push(userError('INVALID_ROUND_STATE', '供託リーチ棒は0以上の整数にしてください', 'riichiSticks'));
  }
  if (input.roundWind < 27 || input.roundWind > 30) {
    errors.push(userError('INVALID_ROUND_STATE', '場風が不正です', 'roundWind'));
  }

  if (input.paoSeat !== undefined) {
    if (input.paoSeat === winner) {
      errors.push(userError('INVALID_RESPONSIBILITY_PAYMENT', '包の責任者にアガった本人は選べません', 'pao'));
    }
    const fromSeats = melds.filter((m) => m.calledFrom !== undefined).map((m) => m.calledFrom);
    if (!fromSeats.includes(input.paoSeat)) {
      errors.push(
        userError('INVALID_RESPONSIBILITY_PAYMENT', '包の責任者は、アガった人に牌を鳴かせた人の中から選んでください', 'pao'),
      );
    }
  }
  return errors;
}

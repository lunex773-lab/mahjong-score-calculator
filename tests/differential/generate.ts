/**
 * 差分テスト用のランダム手牌生成器。
 * 生成したアガリ形を本アプリのエンジンで採点し、JSON Lines で出力する。
 * 出力は compare.py が独立実装（Python「mahjong」ライブラリ）で再計算して照合する。
 */
import { calculateHandScore } from '../../src/domain/mahjong/scoring';
import type { Meld, MeldType, Seat, WinInput } from '../../src/domain/mahjong/hand';
import { NO_FLAGS } from '../../src/domain/mahjong/hand';
import { rankOf, type Tile } from '../../src/domain/mahjong/tile';
import { DEFAULT_RULES, type RuleProfile } from '../../src/domain/rules';

declare const process: { argv: string[] };

let seed = Number(process.argv[2] ?? 1);
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const chance = (p: number) => rand() < p;

const rules: RuleProfile = structuredClone(DEFAULT_RULES);
rules.yaku.doubleWindPairFu = 4; // 比較対象ライブラリの仕様に合わせる

function specialForm(): WinInput {
  const tiles: Tile[] = [];
  if (chance(0.5)) {
    const kinds = new Set<number>();
    while (kinds.size < 7) kinds.add(chance(0.3) ? 27 + Math.floor(rand() * 7) : Math.floor(rand() * 27));
    for (const k of kinds) tiles.push({ kind: k, red: false }, { kind: k, red: false });
  } else {
    const y = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    for (const k of y) tiles.push({ kind: k, red: false });
    tiles.push({ kind: pick(y), red: false });
  }
  const winningTile = tiles.splice(Math.floor(rand() * tiles.length), 1)[0]!;
  const winner = pick([0, 1, 2, 3] as Seat[]);
  const method = chance(0.5) ? 'tsumo' : 'ron';
  const riichi = chance(0.5);
  const used = new Set(tiles.map((t) => t.kind));
  const ind = () => ({ kind: pick([...Array(34).keys()].filter((k) => !used.has(k) && rankOf(k) !== 5)), red: false });
  return {
    winner,
    dealer: pick([0, 1, 2, 3] as Seat[]),
    roundWind: pick([27, 28]),
    method,
    ...(method === 'ron' ? { discarder: ((winner + 1) % 4) as Seat } : {}),
    concealed: tiles,
    melds: [],
    winningTile,
    flags: { ...NO_FLAGS, riichi },
    furiten: 'no',
    dora: { dora: [ind()], kanDora: [], ura: riichi ? [ind()] : [], kanUra: [] },
    honba: 0,
    riichiSticks: 0,
  };
}

function generate(): WinInput | null {
  if (chance(0.12)) return specialForm();
  const counts = new Array<number>(34).fill(0);
  const redUsed = [false, false, false];
  const take = (kind: number): Tile | null => {
    if (counts[kind]! >= 4) return null;
    counts[kind]! += 1;
    const suit = Math.floor(kind / 9);
    if (rankOf(kind) === 5 && !redUsed[suit] && chance(0.35)) {
      redUsed[suit] = true;
      return { kind, red: true };
    }
    return { kind, red: false };
  };
  // 偏りを持たせて役が付きやすい手も作る
  const suitBias = chance(0.3) ? Math.floor(rand() * 3) : -1;
  const randKind = (allowHonor: boolean) => {
    if (allowHonor && chance(0.25)) return 27 + Math.floor(rand() * 7);
    const suit = suitBias >= 0 && chance(0.8) ? suitBias : Math.floor(rand() * 3);
    return suit * 9 + Math.floor(rand() * 9);
  };
  const groups: { type: 'seq' | 'trip'; tiles: Tile[] }[] = [];
  const tripBias = chance(0.25);
  // 特定の役を狙った面子を先に置く
  const preset: { type: 'seq' | 'trip'; kind: number }[] = [];
  const mode = pick(['none', 'none', 'sanshoku', 'ittsu', 'dragons', 'winds', 'terminals', 'doukou']);
  const r = Math.floor(rand() * 7);
  if (mode === 'sanshoku') preset.push(...[0, 9, 18].map((b) => ({ type: 'seq' as const, kind: b + r })));
  if (mode === 'ittsu') preset.push(...[0, 3, 6].map((o) => ({ type: 'seq' as const, kind: pick([0, 9, 18]) + o })));
  if (mode === 'dragons') preset.push(...[31, 32, 33].slice(0, pick([2, 3])).map((k) => ({ type: 'trip' as const, kind: k })));
  if (mode === 'winds') preset.push(...[27, 28, 29, 30].slice(0, pick([3, 4])).map((k) => ({ type: 'trip' as const, kind: k })));
  if (mode === 'terminals') {
    for (let i = 0; i < 3; i++) {
      const b = pick([0, 9, 18]);
      preset.push(chance(0.5) ? { type: 'seq', kind: b + pick([0, 6]) } : { type: 'trip', kind: pick([b, b + 8, 27 + Math.floor(rand() * 7)]) });
    }
  }
  if (mode === 'doukou') preset.push(...[0, 9, 18].map((b) => ({ type: 'trip' as const, kind: b + Math.floor(rand() * 9) })).map((g, _i, arr) => ({ ...g, kind: (g.kind - (g.kind % 9)) + ((arr[0]!.kind) % 9) })));
  for (const g of preset) {
    if (g.type === 'trip') {
      if (counts[g.kind]! > 1) continue;
      groups.push({ type: 'trip', tiles: [take(g.kind)!, take(g.kind)!, take(g.kind)!] });
    } else {
      if (counts[g.kind]! >= 4 || counts[g.kind + 1]! >= 4 || counts[g.kind + 2]! >= 4) continue;
      groups.push({ type: 'seq', tiles: [take(g.kind)!, take(g.kind + 1)!, take(g.kind + 2)!] });
    }
  }
  while (groups.length < 4) {
    if (groups.length + preset.length > 40) return null;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (chance(tripBias ? 0.75 : 0.35)) {
        const k = randKind(true);
        if (counts[k]! > 1) continue;
        groups.push({ type: 'trip', tiles: [take(k)!, take(k)!, take(k)!] });
        break;
      }
      const k = randKind(false);
      if (rankOf(k)! > 7 || counts[k]! >= 4 || counts[k + 1]! >= 4 || counts[k + 2]! >= 4) continue;
      groups.push({ type: 'seq', tiles: [take(k)!, take(k + 1)!, take(k + 2)!] });
      break;
    }
    preset.push({ type: 'seq', kind: 0 }); // 試行回数の上限用
  }
  if (groups.length !== 4) return null;
  // 面子の並びをランダムにして副露にする面子を偏らせない
  groups.sort(() => rand() - 0.5);
  let pair: Tile[] | null = null;
  for (let attempt = 0; attempt < 20 && !pair; attempt++) {
    const k = randKind(true);
    if (counts[k]! <= 2) pair = [take(k)!, take(k)!];
  }
  if (!pair) return null;

  const winner = pick([0, 1, 2, 3] as Seat[]);
  const dealer = pick([0, 1, 2, 3] as Seat[]);
  const meldCount = pick([0, 0, 0, 0, 1, 1, 2, 3, 4]);
  const melds: Meld[] = [];
  const concealed: Tile[] = [...pair];
  groups.forEach((g, i) => {
    if (i < meldCount) {
      if (g.type === 'seq') {
        melds.push({ type: 'chi', tiles: g.tiles, calledFrom: ((winner + 3) % 4) as Seat });
      } else {
        const type: MeldType = pick(['pon', 'pon', 'pon', 'minkan', 'kakan', 'ankan']);
        const tiles = [...g.tiles];
        if (type !== 'pon') {
          const extra = take(g.tiles[0]!.kind);
          if (!extra) {
            melds.push({ type: 'pon', tiles, calledFrom: ((winner + 1) % 4) as Seat });
            return;
          }
          tiles.push(extra);
        }
        melds.push(
          type === 'ankan'
            ? { type, tiles }
            : { type, tiles, calledFrom: ((winner + pick([1, 2, 3])) % 4) as Seat },
        );
      }
    } else {
      concealed.push(...g.tiles);
    }
  });
  const winIdx = Math.floor(rand() * concealed.length);
  const winningTile = concealed.splice(winIdx, 1)[0]!;
  const menzen = melds.every((m) => m.type === 'ankan');
  const method = chance(0.5) ? 'tsumo' : 'ron';
  const hasKan = melds.some((m) => m.type !== 'chi' && m.type !== 'pon');
  const riichi = menzen && chance(0.5);
  const flags = {
    ...NO_FLAGS,
    riichi: riichi && !chance(0.1),
    ippatsu: false,
    rinshan: method === 'tsumo' && hasKan && chance(0.2),
    haitei: false,
    houtei: method === 'ron' && chance(0.08),
  };
  if (riichi && !flags.riichi) (flags as { doubleRiichi: boolean }).doubleRiichi = true;
  if (riichi) flags.ippatsu = chance(0.2);
  if (method === 'tsumo' && !flags.rinshan) flags.haitei = chance(0.08);

  const indicator = () => {
    for (let a = 0; a < 50; a++) {
      const k = Math.floor(rand() * 34);
      if (counts[k]! < 4 - (rankOf(k) === 5 ? 1 : 0)) {
        counts[k]! += 1;
        return { kind: k, red: false };
      }
    }
    throw new Error('no indicator');
  };
  const kanCount = melds.filter((m) => m.type !== 'chi' && m.type !== 'pon').length;
  const dora = {
    dora: [indicator()],
    kanDora: Array.from({ length: kanCount }, indicator),
    ura: flags.riichi || flags.doubleRiichi ? [indicator()] : [],
    kanUra: flags.riichi || flags.doubleRiichi ? Array.from({ length: kanCount }, indicator) : [],
  };
  return {
    winner,
    dealer,
    roundWind: pick([27, 28]),
    method,
    ...(method === 'ron' ? { discarder: ((winner + pick([1, 2, 3])) % 4) as Seat } : {}),
    concealed,
    melds,
    winningTile,
    flags,
    furiten: 'no',
    dora,
    honba: 0,
    riichiSticks: 0,
  };
}

const n = Number(process.argv[3] ?? 1000);
let produced = 0;
while (produced < n) {
  const input = generate();
  if (!input) continue;
  const r = calculateHandScore(input, rules);
  if (!r.valid && r.errors[0]?.code !== 'NO_YAKU') {
    console.error('UNEXPECTED', JSON.stringify(r.errors), JSON.stringify(input));
    continue;
  }
  produced++;
  console.log(
    JSON.stringify({
      input,
      ours: {
        valid: r.valid,
        han: r.han.totalHan,
        fu: r.fu.total,
        total: r.winnerTotal,
        yaku: r.yaku.map((y) => `${y.id}:${y.han}`),
        yakuman: r.yakuman.map((y) => `${y.yakuId}:${y.units}`),
        dora: r.dora.map((d) => `${d.type}:${d.count}`),
      },
    }),
  );
}

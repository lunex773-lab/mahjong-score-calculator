import type { RuleProfile } from '../rules';
import type { DoraIndicators } from './hand';
import { doraFromIndicator, NORTH, tileLabel, type Tile } from './tile';

/**
 * ドラ計算（仕様書 第6章）。表示牌そのものではなく、循環規則で求めたドラ牌の枚数を数える。
 * 裏ドラ・槓裏ドラはリーチ時のみ有効。役が無い場合は呼び出し側でドラを加算しない。
 * 3人打ちで抜いた北は1枚ごとに抜きドラ1翻。北がドラ（表示牌が西）なら、抜いた北もドラとして数える。
 * 抜いた北は手牌の面子・雀頭には含めないため、手牌の北と二重に数えることはない。
 */

export type DoraKindName = 'dora' | 'kanDora' | 'aka' | 'ura' | 'kanUra' | 'nuki';

export interface DoraItem {
  type: DoraKindName;
  label: string;
  count: number;
}

const LABELS: Record<DoraKindName, string> = {
  dora: 'ドラ',
  kanDora: '槓ドラ',
  aka: '赤ドラ',
  ura: '裏ドラ',
  kanUra: '槓裏ドラ',
  nuki: '抜きドラ（北）',
};

function countFor(handTiles: readonly Tile[], indicators: readonly Tile[], playerCount: 3 | 4): { count: number; detail: string } {
  let count = 0;
  const parts: string[] = [];
  for (const ind of indicators) {
    const dora = doraFromIndicator(ind.kind, playerCount);
    const n = handTiles.filter((t) => t.kind === dora).length;
    count += n;
    parts.push(`表示牌${tileLabel(ind.kind)}→${tileLabel(dora)}×${n}`);
  }
  return { count, detail: parts.join('、') };
}

export function countDora(
  handTiles: readonly Tile[],
  indicators: DoraIndicators,
  rules: RuleProfile,
  riichi: boolean,
  nukiCount = 0,
): DoraItem[] {
  const items: DoraItem[] = [];
  const n = rules.game.playerCount;
  // 表示牌との照合には、抜いた北も含める
  const counted = [...handTiles, ...Array.from({ length: nukiCount }, () => ({ kind: NORTH, red: false }))];
  const push = (type: DoraKindName, inds: readonly Tile[]) => {
    if (inds.length === 0) return;
    const { count, detail } = countFor(counted, inds, n);
    items.push({ type, label: `${LABELS[type]}（${detail}）`, count });
  };
  push('dora', indicators.dora);
  if (rules.dora.kan) push('kanDora', indicators.kanDora);
  const akaTotal = rules.dora.aka.man + rules.dora.aka.pin + rules.dora.aka.sou;
  if (akaTotal > 0) {
    const n = handTiles.filter((t) => t.red).length;
    items.push({ type: 'aka', label: LABELS.aka, count: n });
  }
  if (riichi && rules.dora.ura) {
    push('ura', indicators.ura);
    if (rules.dora.kan && rules.dora.kanUra) push('kanUra', indicators.kanUra);
  }
  if (n === 3 && rules.sanma.nukiDora && nukiCount > 0) {
    items.push({ type: 'nuki', label: LABELS.nuki, count: nukiCount });
  }
  return items;
}

import type { RuleProfile } from '../rules';
import type { DoraIndicators } from './hand';
import { doraFromIndicator, tileLabel, type Tile } from './tile';

/**
 * ドラ計算（仕様書 第6章）。表示牌そのものではなく、循環規則で求めたドラ牌の枚数を数える。
 * 裏ドラ・槓裏ドラはリーチ時のみ有効。役が無い場合は呼び出し側でドラを加算しない。
 */

export type DoraKindName = 'dora' | 'kanDora' | 'aka' | 'ura' | 'kanUra';

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
};

function countFor(handTiles: readonly Tile[], indicators: readonly Tile[]): { count: number; detail: string } {
  let count = 0;
  const parts: string[] = [];
  for (const ind of indicators) {
    const dora = doraFromIndicator(ind.kind);
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
): DoraItem[] {
  const items: DoraItem[] = [];
  const push = (type: DoraKindName, inds: readonly Tile[]) => {
    if (inds.length === 0) return;
    const { count, detail } = countFor(handTiles, inds);
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
  return items;
}

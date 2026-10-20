import { TileView } from '../../components/tiles/Tile';
import { doraFromIndicator, tileLabel } from '../../domain/mahjong/tile';
import type { RuleProfile } from '../../domain/rules';
import { DORA_LABELS, DORA_LIMITS, DORA_TARGETS, type DoraTarget, type EditTarget, type HandDraft } from '../../store/types';

/** ドラ表示牌（局全体で共通）の入力。表示牌そのものではなく、次の牌がドラになることを併記する。 */
export function DoraEditor({
  draft,
  rules,
  target,
  onTarget,
  onRemove,
}: {
  draft: HandDraft;
  rules: RuleProfile;
  target: EditTarget;
  onTarget: (t: EditTarget) => void;
  onRemove: (t: DoraTarget, i: number) => void;
}) {
  const enabled: Record<DoraTarget, boolean> = {
    dora: true,
    kanDora: rules.dora.kan,
    ura: rules.dora.ura,
    kanUra: rules.dora.kan && rules.dora.kanUra,
  };
  return (
    <section className="dora-editor" aria-label="ドラ表示牌">
      {DORA_TARGETS.filter((t) => enabled[t]).map((t) => (
        <div key={t} className={`dora-row-edit${target === t ? ' is-active' : ''}`}>
          <button type="button" className={`target-chip${target === t ? ' on' : ''}`} onClick={() => onTarget(t)}>
            {DORA_LABELS[t]}
            {(t === 'ura' || t === 'kanUra') && <small>（リーチ時）</small>}
          </button>
          <div className="dora-slots" onClick={() => onTarget(t)}>
            {draft.dora[t].map((tile, i) => (
              <button
                key={i}
                type="button"
                className="slot-tile"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(t, i);
                }}
                aria-label={`${tileLabel(tile)}を外す`}
                title={`ドラ: ${tileLabel(doraFromIndicator(tile.kind))}`}
              >
                <TileView tile={tile} size="sm" />
                <small className="dora-arrow">→{tileLabel(doraFromIndicator(tile.kind))}</small>
              </button>
            ))}
            {draft.dora[t].length < DORA_LIMITS[t] && <span className="slot-empty small">＋</span>}
          </div>
        </div>
      ))}
    </section>
  );
}

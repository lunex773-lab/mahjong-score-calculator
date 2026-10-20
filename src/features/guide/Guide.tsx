import type { Seat } from '../../domain/mahjong/hand';
import type { HandDraft } from '../../store/types';

/** 入力状態に応じた操作ガイド（済んだ項目にチェックを付ける） */
export function Guide({ draft, seat, name }: { draft: HandDraft; seat: Seat; name: string }) {
  const sd = draft.seats[seat];
  const capacity = 13 - sd.melds.length * 3;
  const riichi = sd.riichi !== 'none';
  const steps: { done: boolean; text: string }[] = [
    { done: sd.concealed.length === capacity, text: `アガった人（${name}）の手牌を${capacity}枚並べる` },
    { done: sd.melds.length > 0 || sd.concealed.length === 13, text: '鳴いた面子・槓があれば「副露」に登録する' },
    { done: !!sd.winningTile, text: '「アガリ牌」を入れる' },
    { done: true, text: `リーチの有無を設定する（現在: ${riichi ? 'あり' : 'なし'}）` },
    { done: draft.dora.dora.length === 1, text: 'ドラ表示牌を入れる' },
  ];
  if (riichi) steps.push({ done: draft.dora.ura.length === 1, text: 'リーチしているので裏ドラ表示牌も入れる' });
  steps.push({ done: false, text: '「アガリ」ボタンでロン／ツモを選んで計算する' });
  const next = steps.find((s) => !s.done);
  return (
    <details className="guide" open={!!next && next !== steps[steps.length - 1]}>
      <summary>
        操作ガイド{next ? `：${next.text}` : ''}
      </summary>
      <ol>
        {steps.map((s) => (
          <li key={s.text} className={s.done ? 'done' : ''}>
            <span aria-hidden="true">{s.done ? '✔' : '・'}</span> {s.text}
          </li>
        ))}
      </ol>
      <p className="note">牌一覧の牌をタップすると、緑の枠で示した入力先に追加されます。牌はドラッグして手牌の好きな位置に置けます。手牌の牌を卓の外へドラッグすると削除できます。</p>
    </details>
  );
}

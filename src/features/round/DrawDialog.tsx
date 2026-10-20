import { useMemo, useState } from 'react';
import { Check, Dialog, Seg } from '../../components/common/Dialog';
import { SEATS, type Seat } from '../../domain/mahjong/hand';
import { findWaits } from '../../domain/mahjong/hand-decomposition';
import { tileLabel, YAOCHU_KINDS } from '../../domain/mahjong/tile';
import { ABORTIVE_LABELS, applyEvent, dealerOf, type AbortiveKind, type GameEvent, type GameState } from '../../domain/round/game';
import { riichiSeats, type HandDraft } from '../../store/types';

type Kind = 'exhaustive' | AbortiveKind | 'chombo';

/** 流局・途中流局・チョンボの記録 */
export function DrawDialog({
  game,
  draft,
  onClose,
  onCommit,
}: {
  game: GameState;
  draft: HandDraft;
  onClose: () => void;
  onCommit: (e: GameEvent) => void;
}) {
  const rules = game.rules;
  const names = game.players;
  const dealer = dealerOf(game);
  const riichi = riichiSeats(draft);

  // 入力済みの手牌（13枚相当）から待ちを求め、テンパイの初期値と確認表示に使う
  const detected = useMemo(
    () =>
      SEATS.map((s) => {
        const sd = draft.seats[s];
        if (sd.concealed.length + sd.melds.length * 3 !== 13) return null;
        return findWaits(sd.concealed, sd.melds);
      }),
    [draft],
  );
  const [kind, setKind] = useState<Kind>('exhaustive');
  const [tenpai, setTenpai] = useState<Seat[]>(() => SEATS.filter((s) => (detected[s]?.length ?? 0) > 0 || riichi.includes(s)));
  const [nagashi, setNagashi] = useState<Seat[]>([]);
  const [chomboSeat, setChomboSeat] = useState<Seat>(0);

  const options: { value: Kind; label: string; disabled?: boolean }[] = [
    { value: 'exhaustive', label: '荒牌流局' },
    { value: 'nineTerminals', label: ABORTIVE_LABELS.nineTerminals, disabled: !rules.draws.nineTerminals },
    { value: 'fourWinds', label: ABORTIVE_LABELS.fourWinds, disabled: !rules.draws.fourWinds },
    { value: 'fourRiichi', label: ABORTIVE_LABELS.fourRiichi, disabled: !rules.draws.fourRiichi },
    { value: 'fourKans', label: ABORTIVE_LABELS.fourKans, disabled: !rules.draws.fourKans },
    { value: 'threeRon', label: ABORTIVE_LABELS.threeRon, disabled: !rules.draws.threeRon },
    { value: 'chombo', label: 'チョンボ' },
  ];

  const event: GameEvent =
    kind === 'exhaustive'
      ? { type: 'exhaustive_draw', riichi, tenpai, nagashi }
      : kind === 'chombo'
        ? { type: 'chombo', seat: chomboSeat }
        : { type: 'abortive_draw', kind, riichi };
  const preview = useMemo(() => applyEvent(game, event), [game, JSON.stringify(event)]);
  const log = preview.ok ? preview.state.logs[preview.state.logs.length - 1] : undefined;

  // 入力済みの手牌と申告の食い違い（形式テンパイの確認）
  const mismatches = SEATS.flatMap((s) => {
    const waits = detected[s];
    if (kind !== 'exhaustive' || waits === null || waits === undefined) return [];
    const declared = tenpai.includes(s);
    if (declared && waits.length === 0) return [`${names[s]}さんの入力済みの手牌はノーテンです`];
    if (!declared && waits.length > 0) return [`${names[s]}さんの入力済みの手牌はテンパイです（待ち: ${waits.map((w) => tileLabel(w)).join('・')}）`];
    return [];
  });
  const nineCheck = (() => {
    if (kind !== 'nineTerminals') return null;
    const hands = SEATS.filter((s) => draft.seats[s].concealed.length >= 13);
    return hands.map((s) => {
      const kinds = new Set(draft.seats[s].concealed.filter((t) => YAOCHU_KINDS.includes(t.kind)).map((t) => t.kind));
      return `${names[s]}さんの入力済みの手牌の么九牌: ${kinds.size}種`;
    });
  })();

  const toggle = (list: Seat[], set: (v: Seat[]) => void, s: Seat) =>
    set(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

  return (
    <Dialog
      title="流局・その他の記録"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            戻る
          </button>
          <button type="button" className="btn btn-primary" disabled={!preview.ok} onClick={() => onCommit(event)}>
            記録する
          </button>
        </>
      }
    >
      <section className="form-block">
        <h3>種類</h3>
        <Seg value={kind} onChange={setKind} options={options} small />
      </section>

      {kind === 'exhaustive' && (
        <section className="form-block">
          <h3>テンパイしていた人</h3>
          <div className="check-grid">
            {SEATS.map((s) => (
              <Check
                key={s}
                label={`${names[s]}${s === dealer ? '（親）' : ''}${riichi.includes(s) ? '・リーチ' : ''}`}
                checked={tenpai.includes(s)}
                onChange={() => toggle(tenpai, setTenpai, s)}
              />
            ))}
          </div>
          {mismatches.map((m) => (
            <p key={m} className="warn">
              ⚠ {m}
            </p>
          ))}
          {rules.draws.nagashiMangan && (
            <>
              <h3>流し満貫</h3>
              <div className="check-grid">
                {SEATS.map((s) => (
                  <Check key={s} label={names[s]!} checked={nagashi.includes(s)} onChange={() => toggle(nagashi, setNagashi, s)} />
                ))}
              </div>
              <p className="note">捨て牌がすべて么九牌で、他家に鳴かれていない人を選びます。満貫ツモ相当の支払いで、ノーテン罰符は発生しません。</p>
            </>
          )}
        </section>
      )}

      {kind === 'chombo' && (
        <section className="form-block">
          <h3>チョンボした人</h3>
          <Seg value={chomboSeat} onChange={setChomboSeat} options={SEATS.map((s) => ({ value: s, label: names[s]! }))} small />
          <p className="note">満貫払い（親のチョンボは4000点オール、子は親へ4000点・子へ2000点）。局はやり直しになり、本場は変わりません。ノーテンリーチもチョンボとして記録します。</p>
        </section>
      )}

      {kind !== 'exhaustive' && kind !== 'chombo' && (
        <p className="note">
          途中流局は親の連荘となり、本場が1本増えます。リーチ棒は供託に残ります。
          {kind === 'fourRiichi' && ' 4人全員をリーチとして入力してください。'}
        </p>
      )}
      {nineCheck?.map((m) => (
        <p key={m} className="note">
          {m}
        </p>
      ))}

      <section className="form-block">
        <h3>点棒の移動（確認）</h3>
        {!preview.ok &&
          preview.errors.map((e, i) => (
            <p key={i} className="error">
              {e.message}
            </p>
          ))}
        {log && (
          <ul className="yaku-list">
            {log.transactions.length === 0 && <li>点棒の移動はありません</li>}
            {log.transactions.map((t, i) => (
              <li key={i}>
                <span>
                  {t.from === 'pot' ? '供託' : names[t.from]} → {t.to === 'pot' ? '供託' : names[t.to]}
                </span>
                <span>{t.amount.toLocaleString()}点</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Dialog>
  );
}

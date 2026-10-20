import { useMemo, useState } from 'react';
import { Check, Dialog, Seg } from '../../components/common/Dialog';
import { SEATS, type Seat } from '../../domain/mahjong/hand';
import { applyEvent, dealerOf, ronPriority, type GameEvent, type GameState } from '../../domain/round/game';
import { riichiSeats, type HandDraft } from '../../store/types';
import { ScoreBreakdown } from '../scoring/ScoreBreakdown';
import { buildRecordedWins, defaultWinnerOptions, type WinnerOptions, type WinSettings } from './build-win';

/**
 * アガリ条件の入力と、記録前の計算結果プレビュー。
 * ロン／ツモで成立条件が異なる項目は、選べない組み合わせを無効化する。
 */
export function WinDialog({
  game,
  draft,
  initialWinner,
  onClose,
  onCommit,
}: {
  game: GameState;
  draft: HandDraft;
  initialWinner: Seat;
  onClose: () => void;
  onCommit: (e: GameEvent) => void;
}) {
  const rules = game.rules;
  const names = game.players;
  const dealer = dealerOf(game);
  const [settings, setSettings] = useState<WinSettings>({
    method: 'ron',
    discarder: null,
    winners: [initialWinner],
    perWinner: { [initialWinner]: defaultWinnerOptions() },
  });
  const maxWinners = rules.wins.multipleRon === 'headBump' ? 1 : rules.wins.multipleRon === 'doubleRon' ? 2 : 3;

  const setMethod = (method: 'ron' | 'tsumo') =>
    setSettings((s) => {
      const winners = method === 'tsumo' ? s.winners.slice(0, 1) : s.winners;
      const perWinner = Object.fromEntries(
        winners.map((w) => {
          const o = s.perWinner[w] ?? defaultWinnerOptions();
          // ロン専用・ツモ専用の項目を切り替え時に外す（黙って残さない）
          return [
            w,
            method === 'tsumo'
              ? { ...o, chankan: false, chankanOnConcealedKan: false, houtei: false, renhou: false, pao: o.pao }
              : { ...o, rinshan: false, haitei: false, tenhou: false, chiihou: false },
          ];
        }),
      );
      return { ...s, method, winners, perWinner, discarder: method === 'tsumo' ? null : s.discarder };
    });

  const toggleWinner = (seat: Seat) =>
    setSettings((s) => {
      if (s.winners.includes(seat)) {
        const winners = s.winners.filter((w) => w !== seat);
        return winners.length === 0 ? s : { ...s, winners };
      }
      const winners = s.method === 'tsumo' ? [seat] : [...s.winners, seat];
      return {
        ...s,
        winners,
        discarder: s.discarder === seat ? null : s.discarder,
        perWinner: { ...s.perWinner, [seat]: s.perWinner[seat] ?? defaultWinnerOptions() },
      };
    });

  const setOpt = (seat: Seat, patch: Partial<WinnerOptions>) =>
    setSettings((s) => ({ ...s, perWinner: { ...s.perWinner, [seat]: { ...(s.perWinner[seat] ?? defaultWinnerOptions()), ...patch } } }));

  const riichi = riichiSeats(draft);
  const { wins, issues } = useMemo(() => buildRecordedWins(draft, settings), [draft, settings]);
  const event: GameEvent = { type: 'hand_won', riichi, wins };
  const preview = useMemo(() => (issues.length === 0 ? applyEvent(game, event) : null), [game, issues.length, JSON.stringify(event)]);

  const ordered =
    settings.method === 'ron' && settings.discarder !== null
      ? [...settings.winners].sort((a, b) => ronPriority(settings.discarder!, a) - ronPriority(settings.discarder!, b))
      : settings.winners;
  const tooMany = settings.winners.length > maxWinners;
  const canCommit = !tooMany && issues.length === 0 && !!preview?.ok;
  const lastLog = preview?.ok ? preview.state.logs[preview.state.logs.length - 1] : undefined;
  const uraIgnored =
    (draft.dora.ura.length > 0 || draft.dora.kanUra.length > 0) && settings.winners.some((w) => draft.seats[w].riichi === 'none');

  return (
    <Dialog
      title="アガリの入力"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            戻る
          </button>
          <button type="button" className="btn btn-primary" disabled={!canCommit} onClick={() => onCommit(event)}>
            この結果を記録
          </button>
        </>
      }
    >
      <section className="form-block">
        <h3>アガリ方</h3>
        <Seg
          value={settings.method}
          onChange={setMethod}
          options={[
            { value: 'ron', label: 'ロン（他家の捨て牌）' },
            { value: 'tsumo', label: 'ツモ（自分で引いた）' },
          ]}
        />
      </section>

      <section className="form-block">
        <h3>アガった人{settings.method === 'ron' && maxWinners > 1 ? `（${maxWinners}人まで選べます）` : ''}</h3>
        <div className="chips">
          {SEATS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip${settings.winners.includes(s) ? ' on' : ''}`}
              disabled={settings.method === 'ron' && settings.discarder === s}
              onClick={() => toggleWinner(s)}
              aria-pressed={settings.winners.includes(s)}
            >
              {names[s]}
              {s === dealer ? '（親）' : ''}
            </button>
          ))}
        </div>
        {tooMany && (
          <p className="error">
            {settings.winners.length === 3 && rules.draws.threeRon
              ? '3人がロンした場合は三家和（途中流局）です。「流局・その他」から記録してください'
              : rules.wins.multipleRon === 'headBump'
                ? '現在のルールは頭ハネです。放銃者の下家に近い1人だけを選んでください'
                : `同時にアガれるのは${maxWinners}人までです`}
          </p>
        )}
      </section>

      {settings.method === 'ron' && (
        <section className="form-block">
          <h3>放銃者（捨て牌でアガられた人）</h3>
          <div className="chips">
            {SEATS.filter((s) => !settings.winners.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${settings.discarder === s ? ' on' : ''}`}
                onClick={() => setSettings((x) => ({ ...x, discarder: s }))}
                aria-pressed={settings.discarder === s}
              >
                {names[s]}
              </button>
            ))}
          </div>
        </section>
      )}

      {ordered.map((seat) => {
        const o = settings.perWinner[seat] ?? defaultWinnerOptions();
        const sd = draft.seats[seat];
        const isRon = settings.method === 'ron';
        const hasKan = sd.melds.some((m) => m.type !== 'chi' && m.type !== 'pon');
        const noCalls = sd.melds.length === 0 && sd.riichi === 'none';
        const isDealer = seat === dealer;
        const paoCandidates = [...new Set(sd.melds.flatMap((m) => (m.calledFrom !== undefined ? [m.calledFrom] : [])))];
        return (
          <section key={seat} className="form-block winner-block">
            <h3>
              {names[seat]}さんのアガリ条件
              <small>
                （リーチ: {sd.riichi === 'none' ? 'なし' : sd.riichi === 'double' ? 'ダブルリーチ' : 'あり'}
                {sd.ippatsu ? '・一発' : ''}）
              </small>
            </h3>
            <div className="check-grid">
              <Check label="嶺上開花" checked={o.rinshan} disabled={isRon || !hasKan} hint="自分の槓の後の嶺上牌でツモ" onChange={(v) => setOpt(seat, { rinshan: v, haitei: v ? false : o.haitei })} />
              <Check label="海底摸月" checked={o.haitei} disabled={isRon || o.rinshan} hint="最後のツモ牌でツモ" onChange={(v) => setOpt(seat, { haitei: v })} />
              <Check label="槍槓" checked={o.chankan} disabled={!isRon} hint="他家の加槓した牌でロン" onChange={(v) => setOpt(seat, { chankan: v, houtei: v ? false : o.houtei })} />
              <Check label="河底撈魚" checked={o.houtei} disabled={!isRon || o.chankan} hint="最後の捨て牌でロン" onChange={(v) => setOpt(seat, { houtei: v })} />
              {rules.wins.kokushiRobConcealedKan && (
                <Check label="暗槓への槍槓（国士無双のみ）" checked={o.chankanOnConcealedKan} disabled={!isRon || !o.chankan} onChange={(v) => setOpt(seat, { chankanOnConcealedKan: v })} />
              )}
              <Check label="天和" checked={o.tenhou} disabled={isRon || !isDealer || !noCalls} hint="親の配牌でアガリ" onChange={(v) => setOpt(seat, { tenhou: v })} />
              <Check label="地和" checked={o.chiihou} disabled={isRon || isDealer || !noCalls} hint="子の第一ツモでアガリ（鳴きが入る前）" onChange={(v) => setOpt(seat, { chiihou: v })} />
              {rules.yaku.renhou !== 'none' && (
                <Check label="人和" checked={o.renhou} disabled={!isRon || isDealer || !noCalls} onChange={(v) => setOpt(seat, { renhou: v })} />
              )}
            </div>
            {isRon && (
              <div className="form-row">
                <span className="form-label">フリテン確認</span>
                <Seg
                  small
                  value={o.furiten}
                  onChange={(v) => setOpt(seat, { furiten: v })}
                  options={[
                    { value: 'no', label: 'フリテンではない' },
                    { value: 'unknown', label: '未確認' },
                    { value: 'yes', label: 'フリテン' },
                  ]}
                />
              </div>
            )}
            {(rules.pao.daisangen || rules.pao.daisuushii || rules.pao.suukantsu) && paoCandidates.length > 0 && (
              <div className="form-row">
                <span className="form-label">包（責任払い）</span>
                <Seg
                  small
                  value={o.pao ?? -1}
                  onChange={(v) => setOpt(seat, { pao: v === -1 ? null : (v as Seat) })}
                  options={[{ value: -1, label: 'なし' }, ...paoCandidates.map((p) => ({ value: p, label: names[p]! }))]}
                />
              </div>
            )}
          </section>
        );
      })}

      {uraIgnored && <p className="note">※ 裏ドラ表示牌は、リーチしていないアガリ者の計算には使われません。</p>}

      <section className="form-block">
        <h3>計算結果（記録前の確認）</h3>
        {issues.map((i) => (
          <p key={i.seat} className="error">
            {names[i.seat]}さん: {i.message}
          </p>
        ))}
        {preview && !preview.ok && (
          <ul className="error-list">
            {preview.errors.map((e, i) => (
              <li key={i} className="error">
                {e.message}
                {!e.userFixable && <small>（アプリ内部の問題です。開発者へ報告してください）</small>}
              </li>
            ))}
          </ul>
        )}
        {lastLog?.results.map((r, i) => (
          <div key={i} className="result-card">
            <h4>{names[ordered[i]!]}さん</h4>
            <ScoreBreakdown result={r} names={names} />
          </div>
        ))}
        {riichi.length > 0 && preview?.ok && (
          <p className="note">リーチ棒: {riichi.map((r) => names[r]).join('・')}（各{rules.settlement.riichiStick}点を供託）</p>
        )}
      </section>
    </Dialog>
  );
}

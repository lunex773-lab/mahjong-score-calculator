import type { ScoringResult } from '../../domain/mahjong/scoring';
import { LIMIT_LABELS } from '../../domain/mahjong/score';
import type { PaymentResult } from '../../domain/mahjong/payment';

const KIND_LABEL: Record<PaymentResult['kind'], string> = {
  hand: '点数',
  honba: '本場',
  deposit: '供託',
  pao: '包（責任払い）',
};

/** 1件のアガリの計算過程（役・翻・符・基本点・支払い）を段階的に表示する */
export function ScoreBreakdown({ result, names }: { result: ScoringResult; names: readonly string[] }) {
  const nameOf = (s: number | 'pot') => (s === 'pot' ? '供託' : (names[s] ?? '?'));
  const isYakuman = result.yakuman.length > 0;
  const headline = isYakuman
    ? result.yakuman.reduce((a, y) => a + y.units, 0) > 1
      ? `${result.yakuman.reduce((a, y) => a + y.units, 0)}倍役満`
      : '役満'
    : result.limit
      ? `${LIMIT_LABELS[result.limit]}（${result.han.totalHan}翻${result.limit === 'mangan' && result.han.totalHan < 5 ? `${result.fu.total}符` : ''}）`
      : `${result.han.totalHan}翻 ${result.fu.total}符`;

  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <span className="breakdown-title">{headline}</span>
        <span className="breakdown-total">{result.winnerTotal.toLocaleString()}点</span>
      </div>

      <details open>
        <summary>成立役</summary>
        <ul className="yaku-list">
          {result.yakuman.map((y) => (
            <li key={y.yakuId}>
              <span>{y.name}</span>
              <span>{y.units > 1 ? `役満×${y.units}` : '役満'}</span>
            </li>
          ))}
          {result.yaku.map((y) => (
            <li key={y.id}>
              <span>{y.name}</span>
              <span>{y.id === 'renhou-mangan' ? '満貫' : `${y.han}翻`}</span>
            </li>
          ))}
          {!isYakuman &&
            result.dora
              .filter((d) => d.count > 0)
              .map((d) => (
                <li key={d.type} className="dora-row">
                  <span>{d.label}</span>
                  <span>{d.count}翻</span>
                </li>
              ))}
        </ul>
        {isYakuman && result.dora.some((d) => d.count > 0) && <p className="note">役満のためドラは点数に加算しません。</p>}
        {!isYakuman && (
          <p className="sum-line">
            合計 {result.han.totalHan}翻（役 {result.han.ordinaryHan}翻＋ドラ {result.han.doraHan}翻）
          </p>
        )}
      </details>

      {!isYakuman && (
        <details>
          <summary>符 {result.fu.total}符</summary>
          <ul className="yaku-list">
            {result.fu.items.map((f, i) => (
              <li key={i}>
                <span>{f.label}</span>
                <span>{f.fu}符</span>
              </li>
            ))}
          </ul>
          {result.fu.special && <p className="note">特則: {result.fu.special}</p>}
        </details>
      )}

      <details open>
        <summary>支払い</summary>
        <p className="note">
          基本点 {result.basePoints.toLocaleString()}（{result.isDealer ? '親' : '子'}の
          {result.payments.length > 1 && !result.payments.some((p) => p.kind === 'pao') ? 'ツモ' : 'アガリ'}）
        </p>
        <ul className="yaku-list">
          {[...result.payments, ...result.honbaPayments, ...(result.depositTransfer ? [result.depositTransfer] : [])].map((p, i) => (
            <li key={i}>
              <span>
                {nameOf(p.from)} → {nameOf(p.to)}
                <small>（{KIND_LABEL[p.kind]}）</small>
              </span>
              <span>{p.amount.toLocaleString()}点</span>
            </li>
          ))}
        </ul>
      </details>

      {result.warnings.map((w) => (
        <p key={w.code} className="warn" role="note">
          ⚠ {w.message}
        </p>
      ))}
      <p className="rule-tag">
        ルール: {result.ruleProfileId} v{result.ruleProfileVersion}
      </p>
    </div>
  );
}

import { useState } from 'react';
import { Seg } from '../../components/common/Dialog';
import { SignedInput } from '../../components/common/SignedInput';
import { computeSettlement } from '../../domain/settlement/settlement';
import { useStore } from '../../store/game-store';
import { fmtNumber, fmtPoints, fmtSigned, fmtUma, playerCountLabel } from '../../ui/format';

const fmtPt = (n: number) => fmtSigned(n, 1);

/** 順位・ウマ・オカ・最終収支。対局の記録から算出するモードと、最終持ち点を直接入力するモード。 */
export function SettlementScreen() {
  const { game, gameState } = useStore();
  const [mode, setMode] = useState<'game' | 'manual'>('game');
  const [manual, setManual] = useState<string[]>(() => (gameState ? gameState.points.map(String) : ['', '', '', '']));
  if (!game || !gameState) return null;
  const rules = game.rules;

  const points = mode === 'game' ? gameState.points : manual.map((v) => Number(v));
  const invalid = mode === 'manual' && manual.some((v) => v.trim() === '' || !Number.isInteger(Number(v)) || Number(v) % 100 !== 0);
  const result = invalid ? null : computeSettlement(points, rules);
  const depositsLeft = mode === 'game' ? gameState.deposits * rules.settlement.riichiStick : 0;

  return (
    <div className="screen">
      <h2 className="screen-title">精算</h2>
      <Seg
        value={mode}
        onChange={setMode}
        options={[
          { value: 'game', label: '対局の記録から' },
          { value: 'manual', label: '最終持ち点を直接入力' },
        ]}
      />
      {mode === 'game' && !gameState.finished && (
        <p className="note">対局はまだ終了していません（{gameState.logs.length}局を記録済み）。現時点の持ち点で試算しています。</p>
      )}
      {mode === 'manual' && (
        <div className="manual-grid">
          {game.players.map((name, i) => (
            <label key={i} className="field">
              <span>{name}</span>
              <SignedInput
                value={manual[i] ?? ''}
                onChange={(v) => setManual((m) => m.map((x, j) => (j === i ? v : x)))}
                label={`${name}の最終持ち点`}
              />
            </label>
          ))}
          {invalid && <p className="error">持ち点は100点単位の整数で{game.players.length}人分を入力してください。</p>}
        </div>
      )}

      {result && (
        <>
          <table className="settle-table">
            <thead>
              <tr>
                <th>順位</th>
                <th>名前</th>
                <th>持ち点</th>
                <th>素点</th>
                <th>ウマ</th>
                <th>オカ</th>
                <th>収支</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.seat}>
                  <td>{r.rank}位</td>
                  <td>{game.players[r.seat]}</td>
                  <td>{fmtNumber(r.points)}</td>
                  <td>{fmtPt(r.base)}</td>
                  <td>{fmtPt(r.uma)}</td>
                  <td>{fmtPt(r.oka)}</td>
                  <td className={r.total >= 0 ? 'plus' : 'minus'}>{fmtPt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="check-list">
            <li className={result.pointsDifference + depositsLeft === 0 ? 'ok' : 'ng'}>
              持ち点合計 {fmtPoints(result.pointsTotal)}（想定 {fmtPoints(result.expectedTotal)}）
              {depositsLeft > 0 && `／場に残っている供託 ${fmtPoints(depositsLeft)}`}
              {result.pointsDifference + depositsLeft !== 0 && `。${fmtPoints(Math.abs(result.pointsDifference + depositsLeft))}の差があります`}
            </li>
            <li className={result.totalSum === 0 ? 'ok' : 'ng'}>
              収支合計 {fmtPt(result.totalSum)}
              {result.totalSum !== 0 && '（持ち点合計が想定と異なるため、0になりません）'}
            </li>
          </ul>
          <p className="note">
            ルール：{playerCountLabel(rules.game.playerCount)}・{fmtPoints(rules.game.startingPoints)}持ち {fmtPoints(rules.game.returnPoints)}返し・ウマ{' '}
            {fmtUma(rules.settlement.uma)}・オカ{rules.settlement.okaEnabled ? `あり（${fmtSigned(result.okaTotal)}）` : 'なし'}・同点は
            {rules.settlement.tieBreak === 'seatOrder' ? '起家に近い方が上位' : '順位点を等分'}。収支は1,000点を1とする単位です。
          </p>
        </>
      )}
    </div>
  );
}

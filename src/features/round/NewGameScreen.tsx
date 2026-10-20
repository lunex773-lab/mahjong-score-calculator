import { useState } from 'react';
import { useStore } from '../../store/game-store';
import type { Players } from '../../store/types';

/** 新しい対局（プレイヤー名の入力）。ルールは現在の設定を開始時点で保存する。 */
export function NewGameScreen({ onStarted, onOpenSettings }: { onStarted: () => void; onOpenSettings: () => void }) {
  const { state, dispatch } = useStore();
  const [names, setNames] = useState<Players>(['A', 'B', 'C', 'D']);
  const r = state.defaultRules;
  const valid = names.every((n) => n.trim().length > 0);
  return (
    <div className="screen">
      <h2 className="screen-title">新しい対局</h2>
      <p className="note">座席（東席＝起家・南席・西席・北席）にすわる人の名前を入力してください（敬称の「さん」は自動で付きます）。東1局は東席の人が親です。</p>
      <div className="manual-grid">
        {(['東席（起家）', '南席', '西席', '北席'] as const).map((label, i) => (
          <label key={label} className="field">
            <span>{label}</span>
            <input
              value={names[i]}
              maxLength={12}
              onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)) as Players)}
            />
          </label>
        ))}
      </div>
      <div className="rule-summary">
        <h3>ルール：{r.name}</h3>
        <p>
          {r.game.length === 'hanchan' ? '東南戦' : '東風戦'}・{r.game.startingPoints.toLocaleString()}点持ち
          {r.game.returnPoints.toLocaleString()}点返し・ウマ {r.settlement.uma.join('/')}・赤ドラ
          {r.dora.aka.man + r.dora.aka.pin + r.dora.aka.sou}枚・
          {r.wins.multipleRon === 'headBump' ? '頭ハネ' : r.wins.multipleRon === 'doubleRon' ? 'ダブロン可' : 'トリロン可'}・切り上げ満貫
          {r.yaku.kiriageMangan ? 'あり' : 'なし'}
        </p>
        <button type="button" className="btn btn-small" onClick={onOpenSettings}>
          ルールを変更
        </button>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-large"
        disabled={!valid}
        onClick={() => {
          dispatch({ type: 'newGame', players: names.map((n) => n.trim()) as Players, rules: r });
          onStarted();
        }}
      >
        対局を始める
      </button>
    </div>
  );
}

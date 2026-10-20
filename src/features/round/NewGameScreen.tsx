import { useState } from 'react';
import { Seg } from '../../components/common/Dialog';
import { SEAT_NAMES } from '../../domain/mahjong/hand';
import type { PlayerCount } from '../../domain/rules';
import { useStore } from '../../store/game-store';
import type { Players } from '../../store/types';
import { playerCountLabel, ruleSummary } from '../../ui/format';

const DEFAULT_NAMES = ['A', 'B', 'C', 'D'];

/** 新しい対局（人数とプレイヤー名）。ルールは人数ごとの設定を、開始時点の内容で保存する。 */
export function NewGameScreen({ onStarted, onOpenSettings }: { onStarted: () => void; onOpenSettings: () => void }) {
  const { state, dispatch } = useStore();
  const [count, setCount] = useState<PlayerCount>(4);
  const [names, setNames] = useState<Players>(DEFAULT_NAMES);
  const r = state.defaultRules[count];
  const seatNames = names.slice(0, count);
  const valid = seatNames.every((n) => n.trim().length > 0);
  return (
    <div className="screen">
      <h2 className="screen-title">新しい対局</h2>

      <h3>人数</h3>
      <Seg
        value={count}
        onChange={setCount}
        label="人数"
        options={[
          { value: 4, label: playerCountLabel(4) },
          { value: 3, label: `${playerCountLabel(3)}（三人麻雀）` },
        ]}
      />

      <h3>プレイヤー</h3>
      <p className="note">
        座席ごとに名前を入力してください。名前の後ろには自動で「さん」が付きます。東1局は東席（起家）の人が親です。
        {count === 3 && '3人打ちでは北席は使いません。'}
      </p>
      <div className="manual-grid">
        {SEAT_NAMES.slice(0, count).map((label, i) => (
          <label key={label} className="field">
            <span>{i === 0 ? `${label}（起家）` : label}</span>
            <input
              value={names[i] ?? ''}
              maxLength={12}
              onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </label>
        ))}
      </div>

      <div className="rule-summary">
        <h3>ルール：{r.name}</h3>
        <p>{ruleSummary(r).join('・')}</p>
        <button type="button" className="btn btn-small" onClick={onOpenSettings}>
          ルールを変更する
        </button>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-large"
        disabled={!valid}
        onClick={() => {
          dispatch({ type: 'newGame', players: seatNames.map((n) => n.trim()), rules: r });
          onStarted();
        }}
      >
        対局を始める
      </button>
    </div>
  );
}

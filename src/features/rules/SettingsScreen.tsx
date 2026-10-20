import { useEffect, useState, type ReactNode } from 'react';
import { SignedInput } from '../../components/common/SignedInput';
import { Check, Seg } from '../../components/common/Dialog';
import { DEFAULT_RULES, validateRuleProfile, type RuleProfile } from '../../domain/rules';
import { useStore } from '../../store/game-store';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, step = 100, min = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      className="num-input"
      value={value}
      step={step}
      min={min}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/** ウマなど負の値を入れる欄（iPhone の数字キーボードにはマイナスが無いため ± ボタン付き） */
function SignedNumber({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]);
  return (
    <SignedInput
      className="num-input-signed"
      value={text}
      label={label}
      onChange={(v) => {
        setText(v);
        if (/^-?[0-9]+$/.test(v)) onChange(Number(v));
      }}
    />
  );
}

/** ルール設定。保存前に矛盾を検証し、変更は新しい対局から適用する（進行中の対局は開始時のルールのまま）。 */
export function SettingsScreen() {
  const { state, game, dispatch } = useStore();
  const [r, setR] = useState<RuleProfile>(() => structuredClone(state.defaultRules));
  const [saved, setSaved] = useState(false);
  const set = (fn: (x: RuleProfile) => void) => {
    setR((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setSaved(false);
  };
  const check = validateRuleProfile(r);
  const issues = check.ok ? [] : check.issues;

  return (
    <div className="screen settings">
      <h2 className="screen-title">ルール設定</h2>
      <p className="note">
        ここでの変更は<b>次に始める対局</b>から適用されます。
        {game && `進行中の対局は開始時のルール（${game.rules.name} v${game.rules.version}）で計算されます。`}
      </p>

      <h3>対局</h3>
      <Row label="対局の長さ">
        <Seg small value={r.game.length} onChange={(v) => set((x) => (x.game.length = v))} options={[{ value: 'hanchan', label: '東南戦（半荘）' }, { value: 'east', label: '東風戦' }]} />
      </Row>
      <Row label="開始持ち点">
        <NumberInput value={r.game.startingPoints} onChange={(v) => set((x) => (x.game.startingPoints = v))} />
      </Row>
      <Row label="返し点">
        <NumberInput value={r.game.returnPoints} onChange={(v) => set((x) => (x.game.returnPoints = v))} />
      </Row>
      <Row label="トビ終了" hint="0点未満で終了">
        <Check label="採用" checked={r.game.bustStop} onChange={(v) => set((x) => (x.game.bustStop = v))} />
      </Row>
      <Row label="オーラスの親">
        <Check label="アガリやめ" checked={r.game.agariYame} onChange={(v) => set((x) => (x.game.agariYame = v))} />
        <Check label="テンパイやめ" checked={r.game.tenpaiYame} onChange={(v) => set((x) => (x.game.tenpaiYame = v))} />
      </Row>
      <Row label="終了時に残った供託">
        <Seg small value={r.game.leftoverDeposit} onChange={(v) => set((x) => (x.game.leftoverDeposit = v))} options={[{ value: 'top', label: 'トップが取る' }, { value: 'none', label: '誰も取らない' }]} />
      </Row>

      <h3>役・点数</h3>
      <Row label="喰いタン">
        <Check label="採用" checked={r.yaku.openTanyao} onChange={(v) => set((x) => (x.yaku.openTanyao = v))} />
      </Row>
      <Row label="切り上げ満貫" hint="30符4翻・60符3翻を満貫">
        <Check label="採用" checked={r.yaku.kiriageMangan} onChange={(v) => set((x) => (x.yaku.kiriageMangan = v))} />
      </Row>
      <Row label="数え役満" hint="13翻以上">
        <Seg small value={r.yaku.kazoeYakuman} onChange={(v) => set((x) => (x.yaku.kazoeYakuman = v))} options={[{ value: 'none', label: '三倍満止まり' }, { value: 'yakuman', label: '役満' }]} />
      </Row>
      <Row label="連風牌の雀頭">
        <Seg small value={r.yaku.doubleWindPairFu} onChange={(v) => set((x) => (x.yaku.doubleWindPairFu = v))} options={[{ value: 2, label: '2符' }, { value: 4, label: '4符' }]} />
      </Row>
      <Row label="複合役満">
        <Seg small value={r.yaku.yakumanStacking} onChange={(v) => set((x) => (x.yaku.yakumanStacking = v))} options={[{ value: 'multiple', label: '加算する' }, { value: 'single', label: '1倍まで' }]} />
      </Row>
      <Row label="ダブル役満">
        <Check label="大四喜" checked={r.yaku.doubleYakuman.daisuushii} onChange={(v) => set((x) => (x.yaku.doubleYakuman.daisuushii = v))} />
        <Check label="四暗刻単騎" checked={r.yaku.doubleYakuman.suuankouTanki} onChange={(v) => set((x) => (x.yaku.doubleYakuman.suuankouTanki = v))} />
        <Check label="国士十三面" checked={r.yaku.doubleYakuman.kokushi13} onChange={(v) => set((x) => (x.yaku.doubleYakuman.kokushi13 = v))} />
        <Check label="純正九蓮" checked={r.yaku.doubleYakuman.chuuren9} onChange={(v) => set((x) => (x.yaku.doubleYakuman.chuuren9 = v))} />
      </Row>
      <Row label="緑一色">
        <Check label="發が必須" checked={r.yaku.ryuuiisouRequiresHatsu} onChange={(v) => set((x) => (x.yaku.ryuuiisouRequiresHatsu = v))} />
      </Row>
      <Row label="人和">
        <Seg small value={r.yaku.renhou} onChange={(v) => set((x) => (x.yaku.renhou = v))} options={[{ value: 'none', label: 'なし' }, { value: 'mangan', label: '満貫' }, { value: 'yakuman', label: '役満' }]} />
      </Row>

      <h3>ドラ</h3>
      <Row label="赤ドラ（枚数）">
        {(['man', 'pin', 'sou'] as const).map((s) => (
          <label key={s} className="inline-field">
            {s === 'man' ? '五萬' : s === 'pin' ? '五筒' : '五索'}
            <NumberInput step={1} value={r.dora.aka[s]} onChange={(v) => set((x) => (x.dora.aka[s] = v))} />
          </label>
        ))}
      </Row>
      <Row label="裏ドラ・槓ドラ">
        <Check label="裏ドラ" checked={r.dora.ura} onChange={(v) => set((x) => (x.dora.ura = v))} />
        <Check label="槓ドラ" checked={r.dora.kan} onChange={(v) => set((x) => (x.dora.kan = v))} />
        <Check label="槓裏ドラ" checked={r.dora.kanUra} onChange={(v) => set((x) => (x.dora.kanUra = v))} />
      </Row>

      <h3>アガリ・流局</h3>
      <Row label="複数人のロン">
        <Seg small value={r.wins.multipleRon} onChange={(v) => set((x) => (x.wins.multipleRon = v))} options={[{ value: 'headBump', label: '頭ハネ' }, { value: 'doubleRon', label: 'ダブロンまで' }, { value: 'tripleRon', label: 'トリロン可' }]} />
      </Row>
      <Row label="ダブロンの本場">
        <Seg small value={r.wins.multipleRonHonba} onChange={(v) => set((x) => (x.wins.multipleRonHonba = v))} options={[{ value: 'nearest', label: '上家取り' }, { value: 'each', label: '両者に付く' }]} />
      </Row>
      <Row label="国士無双の暗槓ロン">
        <Check label="認める" checked={r.wins.kokushiRobConcealedKan} onChange={(v) => set((x) => (x.wins.kokushiRobConcealedKan = v))} />
      </Row>
      <Row label="途中流局">
        <Check label="九種九牌" checked={r.draws.nineTerminals} onChange={(v) => set((x) => (x.draws.nineTerminals = v))} />
        <Check label="四風子連打" checked={r.draws.fourWinds} onChange={(v) => set((x) => (x.draws.fourWinds = v))} />
        <Check label="四家立直" checked={r.draws.fourRiichi} onChange={(v) => set((x) => (x.draws.fourRiichi = v))} />
        <Check label="四槓散了" checked={r.draws.fourKans} onChange={(v) => set((x) => (x.draws.fourKans = v))} />
        <Check label="三家和" checked={r.draws.threeRon} onChange={(v) => set((x) => (x.draws.threeRon = v))} />
      </Row>
      <Row label="流し満貫">
        <Check label="採用" checked={r.draws.nagashiMangan} onChange={(v) => set((x) => (x.draws.nagashiMangan = v))} />
      </Row>
      <Row label="ノーテン罰符（総額）">
        <NumberInput value={r.draws.notenPenaltyTotal} onChange={(v) => set((x) => (x.draws.notenPenaltyTotal = v))} />
      </Row>
      <Row label="包（責任払い）">
        <Check label="大三元" checked={r.pao.daisangen} onChange={(v) => set((x) => (x.pao.daisangen = v))} />
        <Check label="大四喜" checked={r.pao.daisuushii} onChange={(v) => set((x) => (x.pao.daisuushii = v))} />
        <Check label="四槓子" checked={r.pao.suukantsu} onChange={(v) => set((x) => (x.pao.suukantsu = v))} />
      </Row>

      <h3>精算</h3>
      <Row label="本場" hint="ロン／ツモ1人あたり">
        <NumberInput value={r.settlement.honbaRon} onChange={(v) => set((x) => (x.settlement.honbaRon = v))} />
        <NumberInput value={r.settlement.honbaTsumoEach} onChange={(v) => set((x) => (x.settlement.honbaTsumoEach = v))} />
      </Row>
      <Row label="ウマ（1〜4位）">
        {r.settlement.uma.map((u, i) => (
          <SignedNumber key={i} label={`${i + 1}位のウマ`} value={u} onChange={(v) => set((x) => (x.settlement.uma[i] = v))} />
        ))}
      </Row>
      <Row label="オカ" hint="(返し点−開始点)×4をトップへ">
        <Check label="採用" checked={r.settlement.okaEnabled} onChange={(v) => set((x) => (x.settlement.okaEnabled = v))} />
      </Row>
      <Row label="同点の順位">
        <Seg small value={r.settlement.tieBreak} onChange={(v) => set((x) => (x.settlement.tieBreak = v))} options={[{ value: 'seatOrder', label: '起家に近い方が上' }, { value: 'split', label: '順位点を等分' }]} />
      </Row>
      <Row label="チョンボ">
        <span>満貫払い（親4000オール／子は親4000・子2000）</span>
      </Row>

      {issues.length > 0 && (
        <ul className="error-list" role="alert">
          {issues.map((i) => (
            <li key={i.path + i.message} className="error">
              {i.message}
            </li>
          ))}
        </ul>
      )}
      <div className="button-row sticky-actions">
        <button type="button" className="btn" onClick={() => { setR(structuredClone(DEFAULT_RULES)); setSaved(false); }}>
          標準に戻す
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!check.ok}
          onClick={() => {
            if (!check.ok) return;
            const changed = JSON.stringify(check.rules) !== JSON.stringify(DEFAULT_RULES);
            const rules: RuleProfile = changed
              ? { ...check.rules, id: 'custom', name: 'カスタムルール', version: `${DEFAULT_RULES.version}+${Date.now().toString(36)}` }
              : check.rules;
            dispatch({ type: 'setDefaultRules', rules });
            setSaved(true);
          }}
        >
          保存
        </button>
        {saved && <span className="ok-text">保存しました</span>}
      </div>
    </div>
  );
}

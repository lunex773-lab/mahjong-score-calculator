/**
 * 符号付きの数値入力。iPhone の数字キーボードにはマイナス記号が無いため、± ボタンで符号を切り替える。
 */
export function SignedInput({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
}) {
  const negative = value.trim().startsWith('-');
  return (
    <span className={`signed-input${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="sign-btn"
        onClick={() => onChange(negative ? value.trim().slice(1) : `-${value.trim()}`)}
        aria-label={`${label}の符号を${negative ? 'プラス' : 'マイナス'}にする`}
      >
        ±
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="-?[0-9]*"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''))}
      />
    </span>
  );
}

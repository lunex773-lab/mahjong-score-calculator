/** エラーコード（仕様書 第19章）。 */
export type RuleErrorCode =
  | 'INVALID_TILE_COUNT'
  | 'INVALID_TILE_COPIES'
  | 'INVALID_MELD'
  | 'INVALID_WINNING_TILE'
  | 'INVALID_HAND_STRUCTURE'
  | 'NO_YAKU'
  | 'INVALID_RIICHI_STATE'
  | 'INVALID_FURITEN_STATE'
  | 'INVALID_ROUND_STATE'
  | 'INVALID_DORA_INDICATOR'
  | 'INVALID_WIN_CONTEXT'
  | 'INVALID_RULE_PROFILE'
  | 'UNSUPPORTED_RULE'
  | 'INVALID_MULTIPLE_RON'
  | 'INVALID_RESPONSIBILITY_PAYMENT'
  | 'INVALID_SETTLEMENT'
  | 'POINT_CONSERVATION_FAILED';

export interface RuleError {
  code: RuleErrorCode;
  /** ユーザー向けの説明（何を直せばよいか） */
  message: string;
  /** true = ユーザーが入力を直せる項目 / false = 内部の実装不備 */
  userFixable: boolean;
  field?: string;
}

export interface RuleWarning {
  code: string;
  message: string;
}

export const userError = (code: RuleErrorCode, message: string, field?: string): RuleError => ({
  code,
  message,
  userFixable: true,
  ...(field ? { field } : {}),
});

export const internalError = (code: RuleErrorCode, message: string): RuleError => ({
  code,
  message,
  userFixable: false,
});

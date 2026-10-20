import type { Tile, TileKind } from './tile';

/**
 * 座席は固定 ID（0=東席(起家) 1=南席 2=西席 3=北席）で管理する。
 * その局の自風（seatWind）は親の位置から求める別の概念であり、座席 ID と混同しない（設計書 3.3）。
 */
export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const SEAT_NAMES = ['東席', '南席', '西席', '北席'] as const;

export type MeldType = 'chi' | 'pon' | 'minkan' | 'kakan' | 'ankan';

export const MELD_LABELS: Record<MeldType, string> = {
  chi: 'チー',
  pon: 'ポン',
  minkan: '大明槓',
  kakan: '加槓',
  ankan: '暗槓',
};

export interface Meld {
  readonly type: MeldType;
  readonly tiles: readonly Tile[];
  /** 鳴き元の座席（暗槓は無し） */
  readonly calledFrom?: Seat;
}

export const isKanMeld = (m: Meld): boolean => m.type === 'minkan' || m.type === 'kakan' || m.type === 'ankan';
export const isOpenMeld = (m: Meld): boolean => m.type !== 'ankan';

export type WinMethod = 'ron' | 'tsumo';

export interface WinFlags {
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  rinshan: boolean;
  chankan: boolean;
  /** 槍槓の対象が暗槓（国士無双のみ） */
  chankanOnConcealedKan: boolean;
  haitei: boolean;
  houtei: boolean;
  tenhou: boolean;
  chiihou: boolean;
  renhou: boolean;
}

export const NO_FLAGS: WinFlags = {
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  rinshan: false,
  chankan: false,
  chankanOnConcealedKan: false,
  haitei: false,
  houtei: false,
  tenhou: false,
  chiihou: false,
  renhou: false,
};

/** フリテン状態。入力が無い場合は unknown とし、フリテンではないと推測しない（仕様書 10.6）。 */
export type FuritenState = 'unknown' | 'no' | 'yes';

export interface DoraIndicators {
  /** 表ドラ表示牌（1枚） */
  readonly dora: readonly Tile[];
  readonly kanDora: readonly Tile[];
  readonly ura: readonly Tile[];
  readonly kanUra: readonly Tile[];
}

export const EMPTY_DORA: DoraIndicators = { dora: [], kanDora: [], ura: [], kanUra: [] };

export interface WinInput {
  readonly winner: Seat;
  readonly dealer: Seat;
  /** 場風（東=27, 南=28, 西=29, 北=30） */
  readonly roundWind: TileKind;
  readonly method: WinMethod;
  /** ロン時の放銃者 */
  readonly discarder?: Seat;
  /** アガリ牌を除いた手牌（副露を含まない） */
  readonly concealed: readonly Tile[];
  readonly melds: readonly Meld[];
  readonly winningTile: Tile;
  readonly flags: WinFlags;
  readonly furiten: FuritenState;
  readonly dora: DoraIndicators;
  readonly honba: number;
  /** 供託リーチ棒の本数（この局に出たものを含む） */
  readonly riichiSticks: number;
  /** 包の責任者 */
  readonly paoSeat?: Seat;
  /** 3人打ちで抜いた北の枚数（手牌の面子・雀頭には含めない） */
  readonly nukiCount?: number;
}

/** 人数分の座席（3人打ちは東席・南席・西席の3席で、北席は存在しない） */
export const seatsOf = (playerCount: 3 | 4): Seat[] => SEATS.slice(0, playerCount) as Seat[];

/** その局の自風（3人打ちは東・南・西のみ） */
export function seatWindOf(seat: Seat, dealer: Seat, playerCount: 3 | 4 = 4): TileKind {
  return 27 + ((seat - dealer + playerCount) % playerCount);
}

/** seat から見た上家（ひとつ前の手番）の座席 */
export const kamichaOf = (seat: Seat, playerCount: 3 | 4 = 4): Seat => ((seat + playerCount - 1) % playerCount) as Seat;
/** seat から見た下家（ひとつ後の手番）の座席 */
export const shimochaOf = (seat: Seat, playerCount: 3 | 4 = 4): Seat => ((seat + 1) % playerCount) as Seat;
/** seat から見た対面の座席（3人打ちには対面がいない） */
export const toimenOf = (seat: Seat, playerCount: 3 | 4 = 4): Seat | null =>
  playerCount === 3 ? null : (((seat + 2) % 4) as Seat);

export function allHandTiles(input: Pick<WinInput, 'concealed' | 'melds' | 'winningTile'>): Tile[] {
  return [...input.concealed, input.winningTile, ...input.melds.flatMap((m) => m.tiles)];
}

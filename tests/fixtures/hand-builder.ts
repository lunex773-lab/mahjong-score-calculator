import type { Meld, MeldType, Seat, WinFlags, WinInput } from '../../src/domain/mahjong/hand';
import { NO_FLAGS } from '../../src/domain/mahjong/hand';
import { parseTiles } from '../../src/domain/mahjong/tile';

export interface WinSpec {
  hand: string;
  win: string;
  melds?: Meld[];
  method?: 'ron' | 'tsumo';
  winner?: Seat;
  dealer?: Seat;
  discarder?: Seat;
  round?: number;
  flags?: Partial<WinFlags>;
  dora?: string;
  kanDora?: string;
  ura?: string;
  kanUra?: string;
  honba?: number;
  sticks?: number;
  pao?: Seat;
  furiten?: 'unknown' | 'no' | 'yes';
}

export function meld(type: MeldType, tiles: string, calledFrom?: Seat): Meld {
  return { type, tiles: parseTiles(tiles), ...(calledFrom !== undefined ? { calledFrom } : {}) };
}

/** テスト用のアガリ入力。既定は 東場・親=東席(0)・アガリ=南席(1)・ロン・放銃=西席(2)・ドラ表示牌 9s(→1s) */
export function winInput(spec: WinSpec): WinInput {
  const method = spec.method ?? 'ron';
  const winner = spec.winner ?? 1;
  const discarder = method === 'ron' ? (spec.discarder ?? (((winner + 1) % 4) as Seat)) : undefined;
  return {
    winner,
    dealer: spec.dealer ?? 0,
    roundWind: spec.round ?? 27,
    method,
    ...(discarder !== undefined ? { discarder } : {}),
    concealed: parseTiles(spec.hand),
    melds: spec.melds ?? [],
    winningTile: parseTiles(spec.win)[0]!,
    flags: { ...NO_FLAGS, ...spec.flags },
    furiten: spec.furiten ?? 'no',
    dora: {
      dora: parseTiles(spec.dora ?? '9s'),
      kanDora: spec.kanDora ? parseTiles(spec.kanDora) : [],
      ura: spec.ura ? parseTiles(spec.ura) : [],
      kanUra: spec.kanUra ? parseTiles(spec.kanUra) : [],
    },
    honba: spec.honba ?? 0,
    riichiSticks: spec.sticks ?? 0,
    ...(spec.pao !== undefined ? { paoSeat: spec.pao } : {}),
  };
}

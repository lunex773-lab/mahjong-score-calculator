import { NO_FLAGS, type FuritenState, type Seat, type WinFlags, type WinMethod } from '../../domain/mahjong/hand';
import type { RecordedWin } from '../../domain/round/game';
import type { HandDraft } from '../../store/types';

/** アガリ方法・状況役など、牌姿以外のアガリ条件 */
export interface WinSettings {
  method: WinMethod;
  discarder: Seat | null;
  winners: Seat[];
  /** 勝者ごとの状況（リーチ・一発は卓の入力から取る） */
  perWinner: Record<number, WinnerOptions>;
}

export interface WinnerOptions {
  rinshan: boolean;
  chankan: boolean;
  chankanOnConcealedKan: boolean;
  haitei: boolean;
  houtei: boolean;
  tenhou: boolean;
  chiihou: boolean;
  renhou: boolean;
  furiten: FuritenState;
  pao: Seat | null;
}

export const defaultWinnerOptions = (): WinnerOptions => ({
  rinshan: false,
  chankan: false,
  chankanOnConcealedKan: false,
  haitei: false,
  houtei: false,
  tenhou: false,
  chiihou: false,
  renhou: false,
  furiten: 'unknown',
  pao: null,
});

export interface BuildIssue {
  seat: Seat;
  message: string;
}

/** 下書きの牌姿とアガリ条件から、記録するアガリ入力を組み立てる */
export function buildRecordedWins(draft: HandDraft, settings: WinSettings): { wins: RecordedWin[]; issues: BuildIssue[] } {
  const wins: RecordedWin[] = [];
  const issues: BuildIssue[] = [];
  for (const seat of settings.winners) {
    const sd = draft.seats[seat];
    const opt = settings.perWinner[seat] ?? defaultWinnerOptions();
    if (!sd.winningTile) {
      issues.push({ seat, message: 'アガリ牌を入力してください。' });
      continue;
    }
    if (settings.method === 'ron' && settings.discarder === null) {
      issues.push({ seat, message: '放銃者（誰の捨て牌でアガったか）を選んでください。' });
      continue;
    }
    const flags: WinFlags = {
      ...NO_FLAGS,
      riichi: sd.riichi === 'riichi',
      doubleRiichi: sd.riichi === 'double',
      ippatsu: sd.ippatsu,
      rinshan: opt.rinshan,
      chankan: opt.chankan,
      chankanOnConcealedKan: opt.chankan && opt.chankanOnConcealedKan,
      haitei: opt.haitei,
      houtei: opt.houtei,
      tenhou: opt.tenhou,
      chiihou: opt.chiihou,
      renhou: opt.renhou,
    };
    wins.push({
      winner: seat,
      method: settings.method,
      ...(settings.method === 'ron' && settings.discarder !== null ? { discarder: settings.discarder } : {}),
      concealed: sd.concealed,
      melds: sd.melds,
      winningTile: sd.winningTile,
      flags,
      furiten: settings.method === 'tsumo' ? 'no' : opt.furiten,
      // 裏ドラはリーチした人だけが見る（ダブロンで片方だけリーチの場合もある）
      dora: flags.riichi || flags.doubleRiichi ? draft.dora : { ...draft.dora, ura: [], kanUra: [] },
      ...(opt.pao !== null ? { paoSeat: opt.pao } : {}),
      ...(sd.nuki > 0 ? { nukiCount: sd.nuki } : {}),
    });
  }
  return { wins, issues };
}

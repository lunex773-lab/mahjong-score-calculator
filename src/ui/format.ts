import type { RuleProfile } from '../domain/rules';

/**
 * 画面表記の統一ルール（docs/STYLE.md）に沿った書式関数。
 * 画面で数値やルールを表示するときは、直接文字列を組み立てずにここを通す。
 */

/** 3桁区切りの数値（例: 30,000） */
export const fmtNumber = (n: number): string => n.toLocaleString('ja-JP');

/** 点数（例: 30,000点） */
export const fmtPoints = (n: number): string => `${fmtNumber(n)}点`;

/** 符号付きの数値。マイナスは全角相当の「−」を使う（例: +32.0 / −15.0 / 0.0） */
export function fmtSigned(n: number, digits = 0): string {
  const body = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${body}`;
  if (n < 0) return `−${body}`;
  return body;
}

/** ウマ（例: +30／+10／−10／−30） */
export const fmtUma = (uma: readonly number[]): string => uma.map((u) => fmtSigned(u)).join('／');

export const playerCountLabel = (n: 3 | 4): string => `${n}人打ち`;

/** ルールの概要（新規対局・設定・精算で同じ文面を使う） */
export function ruleSummary(r: RuleProfile): string[] {
  const n = r.game.playerCount;
  const aka = r.dora.aka.man + r.dora.aka.pin + r.dora.aka.sou;
  const items = [
    playerCountLabel(n),
    r.game.length === 'hanchan' ? '東南戦' : '東風戦',
    `${fmtPoints(r.game.startingPoints)}持ち ${fmtPoints(r.game.returnPoints)}返し`,
    `ウマ ${fmtUma(r.settlement.uma)}`,
    aka > 0 ? `赤ドラ${aka}枚` : '赤ドラなし',
    r.wins.multipleRon === 'headBump' ? '頭ハネ' : r.wins.multipleRon === 'doubleRon' ? 'ダブロンあり' : 'トリロンあり',
    `切り上げ満貫${r.yaku.kiriageMangan ? 'あり' : 'なし'}`,
  ];
  if (n === 3) {
    items.push(r.sanma.tsumoPayment === 'split' ? 'ツモは北家分を折半' : 'ツモ損あり');
    items.push(r.sanma.nukiDora ? '北抜きあり' : '北抜きなし');
    items.push(r.sanma.allowChi ? 'チーあり' : 'チーなし');
  }
  return items;
}

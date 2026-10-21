import { describe, expect, it } from 'vitest';
import { fullAppHeight } from '../../src/ui/app-height';

describe('画面の高さの自動調整', () => {
  it('iPhone 14 のホーム画面アプリ: ステータスバー分（47pt）短く報告されたら画面の高さに合わせる', () => {
    expect(fullAppHeight({ iosStandalone: true, innerWidth: 390, innerHeight: 797, screenWidth: 390, screenHeight: 844 })).toBe(844);
  });
  it('iPhone 17 のホーム画面アプリ', () => {
    expect(fullAppHeight({ iosStandalone: true, innerWidth: 402, innerHeight: 812, screenWidth: 402, screenHeight: 874 })).toBe(874);
  });
  it('正しく報告されているときは調整しない', () => {
    expect(fullAppHeight({ iosStandalone: true, innerWidth: 390, innerHeight: 844, screenWidth: 390, screenHeight: 844 })).toBeNull();
  });
  it('横向きでは短い辺を高さにする', () => {
    expect(fullAppHeight({ iosStandalone: true, innerWidth: 844, innerHeight: 390, screenWidth: 390, screenHeight: 844 })).toBeNull();
    expect(fullAppHeight({ iosStandalone: true, innerWidth: 844, innerHeight: 370, screenWidth: 390, screenHeight: 844 })).toBe(390);
  });
  it('Safari のタブ内や Android では調整しない（100dvh に任せる）', () => {
    expect(fullAppHeight({ iosStandalone: false, innerWidth: 390, innerHeight: 664, screenWidth: 390, screenHeight: 844 })).toBeNull();
  });
});

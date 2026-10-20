import { describe, expect, it } from 'vitest';
import { nearestAngleFor, seatOfAngle, snapToAvailable } from '../../src/components/table/MahjongTable';

describe('3D卓の回転角', () => {
  it('角度から手前の席を求める（90度ごと、負の角度・複数周も可）', () => {
    expect([0, 90, 180, 270, 360, -90, 44, 46, 450].map(seatOfAngle)).toEqual([0, 1, 2, 3, 0, 3, 0, 1, 1]);
  });
  it('席を切り替えるときは最短方向に回す（北席→東席は+90度）', () => {
    expect(nearestAngleFor(270, 0)).toBe(360);
    expect(nearestAngleFor(0, 3)).toBe(-90);
    // 対面へはどちら回りでも180度
    const opposite = nearestAngleFor(720, 2);
    expect(Math.abs(opposite - 720)).toBe(180);
    expect(seatOfAngle(opposite)).toBe(2);
    expect(nearestAngleFor(90, 1)).toBe(90);
  });
  it('3人打ちでは空席（北席=270度）で止まらず、回した向きの次の席へ進む', () => {
    expect(snapToAvailable(270, +1, 3)).toBe(360); // 西席→（空席）→東席
    expect(snapToAvailable(270, -1, 3)).toBe(180); // 東席→（空席）→西席
    expect(snapToAvailable(90, +1, 3)).toBe(90);
    expect(snapToAvailable(270, +1, 4)).toBe(270);
  });
});

import { expect, test, type Page } from '@playwright/test';

/** 牌一覧の分類タブを開いて牌をタップする */
async function tapTile(page: Page, tab: '萬子' | '筒子' | '索子' | '字牌', label: string) {
  await page.getByRole('tab', { name: tab }).click();
  await page.getByRole('button', { name: new RegExp(`^${label}を追加`) }).click();
}

async function startGame(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: '対局を始める' }).click();
}

test('新規対局→手牌入力→アガリ計算→記録→保存の再読み込み→精算', async ({ page }) => {
  await startGame(page);

  // 南席（B）を選ぶと卓が回転して B が手前に来る
  await page.locator('.seat-tab').nth(1).click();
  await expect(page.locator('.seat-plate.is-selected')).toContainText('B');

  // 123m 456p 789s 23s 55p ＋ アガリ牌 4s（リーチ・平和）
  for (const l of ['1萬', '2萬', '3萬']) await tapTile(page, '萬子', l);
  for (const l of ['4筒', '5筒', '6筒', '5筒', '5筒']) await tapTile(page, '筒子', l);
  for (const l of ['7索', '8索', '9索', '2索', '3索']) await tapTile(page, '索子', l);
  await expect(page.getByRole('button', { name: /手牌 13\/13枚/ })).toBeVisible();
  await page.getByRole('button', { name: 'アガリ牌', exact: true }).click();
  await tapTile(page, '索子', '4索');
  await page.getByRole('radio', { name: 'リーチ', exact: true }).click();
  await page.getByRole('button', { name: 'ドラ表示牌', exact: true }).click();
  await tapTile(page, '字牌', '北');
  await page.getByRole('button', { name: /^裏ドラ表示牌/ }).click();
  await tapTile(page, '字牌', '白');

  await page.getByRole('button', { name: 'アガリ（点数計算）' }).click();
  const dialog = page.getByRole('dialog', { name: 'アガリの入力' });
  // 放銃者に西席の C を選ぶ
  await dialog.locator('.form-block').filter({ hasText: '放銃者' }).getByRole('button', { name: 'C' }).click();
  await dialog.getByRole('radio', { name: 'フリテンではない' }).click();
  await expect(dialog.locator('.breakdown-title')).toHaveText('2翻 30符');
  await expect(dialog.locator('.breakdown-total')).toHaveText('3,000点');
  await expect(dialog.locator('.yaku-list').first()).toContainText('立直');
  await expect(dialog.locator('.yaku-list').first()).toContainText('平和');
  await dialog.getByRole('button', { name: 'この結果を記録' }).click();

  const result = page.getByRole('dialog', { name: /の結果$/ });
  await expect(result).toContainText('B ロン 3,000点');
  await result.getByRole('button', { name: '次の局へ' }).click();

  // 東2局（南席が親）に進み、持ち点が反映される
  await expect(page.locator('.center-round')).toHaveText('東2局 0本場');
  await expect(page.locator('.seat-tab').nth(1)).toContainText('親');

  // 再読み込みしても保存された対局が復元される
  await page.reload();
  await expect(page.locator('.center-round')).toHaveText('東2局 0本場');

  await page.getByRole('button', { name: /精算/ }).click();
  const rows = page.locator('.settle-table tbody tr');
  await expect(rows.nth(0)).toContainText('B');
  await expect(rows.nth(0)).toContainText('32,000');
  await expect(page.locator('.check-list')).toContainText('収支合計 0.0');
});

test('役なし・不正な牌姿は記録できず、理由を表示する', async ({ page }) => {
  await startGame(page);
  for (const l of ['1萬', '2萬', '3萬']) await tapTile(page, '萬子', l);
  for (const l of ['4筒', '5筒', '6筒', '7筒', '7筒']) await tapTile(page, '筒子', l);
  for (const l of ['7索', '8索', '9索']) await tapTile(page, '索子', l);
  for (const l of ['東', '東']) await tapTile(page, '字牌', l);
  await page.getByRole('button', { name: 'アガリ牌', exact: true }).click();
  await tapTile(page, '筒子', '7筒');
  await page.getByRole('button', { name: 'ドラ表示牌', exact: true }).click();
  await tapTile(page, '字牌', '北');
  await page.getByRole('button', { name: 'アガリ（点数計算）' }).click();
  const dialog = page.getByRole('dialog', { name: 'アガリの入力' });
  await dialog.locator('.form-block').filter({ hasText: '放銃者' }).getByRole('button', { name: 'C' }).click();
  // 東は対子（雀頭）なので役牌にならず、シャンポン待ちで平和もない → 役なし
  await expect(dialog.locator('.error').first()).toContainText('役がありません');
  await expect(dialog.getByRole('button', { name: 'この結果を記録' })).toBeDisabled();
});

test('5枚目の牌は追加できない（物理枚数の検証）', async ({ page }) => {
  await startGame(page);
  for (let i = 0; i < 4; i++) await tapTile(page, '字牌', '中');
  await expect(page.getByRole('button', { name: /^中を追加（残り0枚）/ })).toBeDisabled();
});

test('ドラッグで挿入・並べ替え、卓の外へドラッグで削除、スワイプで席を切り替え', async ({ page }) => {
  await startGame(page);
  for (const l of ['1萬', '2萬', '3萬']) await tapTile(page, '萬子', l);
  const rack = page.locator('.rack');
  const tiles = rack.locator('.rack-tile');

  // 牌一覧の 9萬 を 1萬 の前（先頭）へドラッグ
  const src = page.getByRole('button', { name: /^9萬を追加/ });
  const first = await tiles.nth(0).boundingBox();
  const s = await src.boundingBox();
  await page.mouse.move(s!.x + s!.width / 2, s!.y + s!.height / 2);
  await page.mouse.down();
  await page.mouse.move(first!.x + 4, first!.y + first!.height / 2, { steps: 12 });
  await expect(page.locator('.insert-marker')).toBeVisible();
  await page.mouse.up();
  await expect(tiles).toHaveCount(4);
  await expect(tiles.nth(0).locator('[data-tile]')).toHaveAttribute('data-tile', '9萬');

  // 先頭の牌を卓の外（ガイドの位置）へドラッグすると削除される
  const t0 = await tiles.nth(0).boundingBox();
  const outside = await page.locator('.dora-editor').boundingBox();
  await page.mouse.move(t0!.x + t0!.width / 2, t0!.y + t0!.height / 2);
  await page.mouse.down();
  await page.mouse.move(outside!.x + 20, outside!.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect(tiles).toHaveCount(3);

  // 元に戻す
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(tiles).toHaveCount(4);

  // 卓を左へスワイプ → 南席が手前に
  const stage = await page.locator('.table-stage').first().boundingBox();
  const y = stage!.y + 20;
  await page.mouse.move(stage!.x + stage!.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(stage!.x + stage!.width * 0.2, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.seat-tab.on')).toContainText('南席');
  // 東席の入力は保持されている
  await page.locator('.seat-tab').nth(0).click();
  await expect(tiles).toHaveCount(4);
});

test('俯瞰ボタンで4人分の牌を表示する', async ({ page }) => {
  await startGame(page);
  for (const l of ['1萬', '2萬']) await tapTile(page, '萬子', l);
  await page.locator('.seat-tab').nth(2).click();
  await tapTile(page, '字牌', '發');
  await page.getByRole('button', { name: '俯瞰' }).click();
  const dialog = page.getByRole('dialog', { name: /俯瞰/ });
  await expect(dialog.locator('.overview-hand [data-tile]')).toHaveCount(3);
});

test('流局のノーテン罰符と連荘', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: '流局・その他' }).click();
  const dialog = page.getByRole('dialog', { name: /流局/ });
  await dialog.getByLabel(/^A（親）/).check();
  await expect(dialog.locator('.yaku-list')).toContainText('1,000点');
  await dialog.getByRole('button', { name: '記録する' }).click();
  await page.getByRole('dialog', { name: /の結果$/ }).getByRole('button', { name: '次の局へ' }).click();
  await expect(page.locator('.center-round')).toHaveText('東1局 1本場');
  await expect(page.locator('.seat-tab').nth(0)).toContainText('親');
});

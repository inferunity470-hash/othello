import { test, expect } from '@playwright/test';

test.describe('lobby & hotseat', () => {
  test('renders lobby with all three modes', async ({ page }) => {
    await page.goto('/');
    // Dismiss the first-time tour if visible
    const skip = page.getByRole('button', { name: /スキップ/ });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    }
    await expect(page.getByRole('heading', { name: /ビッド式オセロ/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /同機ホットシート/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /NPC 対戦/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /友達とオンライン/ })).toBeVisible();
  });

  test('can start hotseat game and submit a bid', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('button', { name: /スキップ/ });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    }
    await page.getByRole('button', { name: /▶ 対局開始/ }).click();
    // First handoff overlay
    await expect(page.getByText(/🔒 黒 の番です/)).toBeVisible();
    await page.getByRole('button', { name: '確認' }).click();
    // Bid panel for BLACK
    await expect(page.getByRole('button', { name: /✓ 入札を確定/ })).toBeVisible();
    await page.getByRole('button', { name: /✓ 入札を確定/ }).click();
    // White's handoff
    await expect(page.getByText(/🔒 白 の番です/)).toBeVisible();
    await page.getByRole('button', { name: '確認' }).click();
    await page.getByRole('button', { name: /✓ 入札を確定/ }).click();
    // Reveal modal
    await expect(page.getByText(/入札公開/)).toBeVisible();
  });

  test('help overlay opens and closes', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('button', { name: /スキップ/ });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    }
    await page.getByRole('button', { name: /❓ ルール/ }).click();
    await expect(page.getByText(/ビッド式オセロ ルール/)).toBeVisible();
    await page.getByRole('button', { name: /^閉じる$/ }).click();
    await expect(page.getByText(/ビッド式オセロ ルール/)).not.toBeVisible();
  });
});

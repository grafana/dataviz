import { test, expect } from '@playwright/test';
import { draw, fixtureSpec, readMessages } from './harness';

for (const theme of ['dark', 'light']) {
  for (const width of [375, 1280]) {
    test(`standalone time selector at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await draw(page, { ...fixtureSpec('prometheus-line'), theme }, { size: { width, height: 600 } });
      const app = page.frameLocator('#app');
      const trigger = app.getByTestId('data-testid TimePicker Open Button');
      await expect(trigger).toBeVisible();
      await expect(app.getByRole('button', { name: 'Move time range backwards' })).toHaveCount(0);
      await expect(app.getByRole('button', { name: 'Move time range forwards' })).toHaveCount(0);
      await expect(app.getByRole('button', { name: 'Zoom out time range' })).toHaveCount(0);
      await trigger.click();
      await expect(app.getByRole('dialog', { name: 'Time range picker' })).toBeVisible();
      const search = app.getByRole('textbox', { name: 'Search quick ranges' });
      await search.fill('3h');
      await search.press('Enter');
      await expect.poll(async () => (await readMessages(page)).filter((m) => m.type === 'refresh').length).toBe(1);
      expect((await readMessages(page)).filter((m) => m.type === 'error')).toEqual([]);
    });
  }
}

test('outside click closes the picker on a wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await draw(page, fixtureSpec('prometheus-line'), { size: { width: 1280, height: 600 } });
  const app = page.frameLocator('#app');
  await app.getByTestId('data-testid TimePicker Open Button').click();
  const dialog = app.getByRole('dialog', { name: 'Time range picker' });
  await expect(dialog).toBeVisible();
  await app.locator('body').click({ position: { x: 10, y: 590 } });
  await expect(dialog).toBeHidden();
});

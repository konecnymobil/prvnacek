import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
// @ts-expect-error – plain ESM script without types
import { renderMarkdown, policyHash, MD, LOCK, POLICY } from '../scripts/gen-policy.mjs';

const policy = JSON.parse(fs.readFileSync(POLICY, 'utf8')) as { policyVersion: string; effectiveDate: string; rules: { id: string; text: string }[]; today: { items: string[] }; backupNote: string };

test.use({ serviceWorkers: 'block' });

test('docs/nakladani-s-daty.md je aktuální (npm run gen:policy)', () => {
  expect(fs.readFileSync(MD, 'utf8')).toBe(renderMarkdown(policy));
});

test('uživatelské texty nezmiňují hardware', () => {
  const texts = [fs.readFileSync(POLICY, 'utf8'), fs.readFileSync(MD, 'utf8'), fs.readFileSync('src/screens/DataPolicy.tsx', 'utf8'), fs.readFileSync('src/screens/BackupPanel.tsx', 'utf8'), fs.readFileSync('src/screens/About.tsx', 'utf8')];
  for (const t of texts) expect(t).not.toMatch(/mini ?pc|home ?assistant|raspberry|\bNAS\b/i);
});

test('změna pravidel vyžaduje zvýšení policyVersion', () => {
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  expect(lock[policy.policyVersion], 'Pravidla se změnila bez zvýšení policyVersion – zvyš verzi a spusť npm run gen:policy').toBe(policyHash(policy));
});

async function expectAllRules(page: Page) {
  await expect(page.getByTestId('data-policy')).toBeVisible();
  await expect(page.getByTestId('policy-version')).toContainText(policy.policyVersion);
  await expect(page.getByTestId('policy-version')).toContainText(policy.effectiveDate);
  for (const r of policy.rules) await expect(page.getByTestId(`policy-rule-${r.id}`)).toContainText(r.text);
  await expect(page.getByTestId('policy-backup-note')).toHaveText(policy.backupNote);
  await expect(page.locator('body')).not.toContainText(/MiniPC|Home Assistant/i);
  for (const i of policy.today.items) await expect(page.getByText(i, { exact: true })).toBeVisible();
}

test('obrazovka z rodičovské sekce i z O aplikaci ukazuje všechna pravidla', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [x, y] = q.split('=')[0].split('+').map((v) => parseInt(v, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${x + y}$`) }).click();
  await expect(page.getByTestId('backup-server-note')).toHaveText(policy.backupNote);
  await expect(page.getByTestId('backup-server-note')).toContainText('zatím není aktivní');
  await page.getByTestId('open-data-policy').click();
  await expectAllRules(page);
  await page.getByRole('button', { name: 'Zpět' }).click();
  await expect(page.getByTestId('parent-home')).toBeVisible();

  await page.goto('./');
  await page.getByRole('button', { name: /O aplikaci/ }).click();
  await page.getByTestId('about-data-policy').click();
  await expectAllRules(page);
});

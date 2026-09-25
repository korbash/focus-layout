import { test, expect } from '@playwright/test';
test('exploration, rich edges, filters, interruption, history and keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const canvas = page.locator('#graph');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('[data-node="document"]')).toHaveClass(/focus/);
  await expect(page.locator('[data-label="reviewer"]')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect author', exact: true }).click();
  await expect(page.locator('#detail-title')).toHaveText('author');
  await expect(page.locator('#detail-type')).toHaveText('Document → Person');
  await page.getByRole('button', { name: 'Focus Person', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('[data-node="person"]')).toHaveClass(/focus/);
  await expect(page.locator('[data-label="mentor"]')).toBeVisible();
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('#focus-name')).toHaveText('Document');
  await page.getByLabel('identity.ts').uncheck();
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('[data-label="mentor"]')).toHaveCount(0);
  await page.getByLabel('Jump to a node').selectOption('team');
  await page.getByLabel('Jump to a node').selectOption('topic');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('#focus-name')).toHaveText('Topic');
  await page.getByLabel('Follow connections').selectOption('both');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  const document = page.getByRole('button', { name: 'Focus Document', exact: true });
  await document.focus(); await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('#focus-name')).toHaveText('Document');
  await page.getByLabel('Arrangement').selectOption('horizontal');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.getByRole('alert')).toBeHidden();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/demo.png', fullPage: true });
});

test('Topic explains outgoing-only view, reveals incoming, and arrow tips stay clear of target cards', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#graph');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  const checkArrowGeometry = async () => {
    const routes = await page.locator('[data-edge]').evaluateAll(groups => groups.map(group => {
      const path = group.querySelector('.edge-target') as SVGPathElement;
      const rect = document.querySelector(`[data-node="${group.getAttribute('data-target')}"] rect`) as SVGRectElement;
      const size = rect.getBBox();
      const length = path.getTotalLength();
      const local = (distance: number) => {
        const p = path.getPointAtLength(distance);
        return new DOMPoint(p.x, p.y).matrixTransform(path.getCTM()!).matrixTransform(rect.getCTM()!.inverse());
      };
      const end = local(length), before = local(Math.max(0, length - 1));
      const distance = (p: DOMPoint) => Math.hypot(Math.max(size.x - p.x, 0, p.x - size.x - size.width), Math.max(size.y - p.y, 0, p.y - size.y - size.height));
      return { id: group.getAttribute('data-edge'), gap: distance(end), approachGap: distance(before), marker: path.getAttribute('marker-end') };
    }));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.gap, `${route.id} tip clearance`).toBeCloseTo(9, 1);
      expect(route.approachGap, `${route.id} must approach from outside`).toBeGreaterThan(route.gap);
      expect(route.marker).toMatch(/^url\(#arrow-/);
    }
  };
  await checkArrowGeometry();
  await page.getByLabel('Jump to a node').selectOption('topic');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('[data-node]')).toHaveCount(1);
  await expect(page.locator('[data-edge="related"]')).toBeVisible();
  await expect(page.locator('#direction-hint')).toContainText('No outgoing connections to other nodes');
  await expect(page.locator('#incoming-count')).toHaveText('1');
  await checkArrowGeometry();
  await page.getByRole('button', { name: 'Show incoming connections', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('#show-both')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#direction')).toHaveValue('both');
  await expect(page.locator('[data-node="document"]')).toBeVisible();
  await expect(page.locator('[data-edge="topic"]')).toBeVisible();
  await checkArrowGeometry();
  await page.locator('#show-in').click();
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('#direction')).toHaveValue('in');
  await expect(page.locator('[data-node="document"]')).toBeVisible();
  await page.getByLabel('content.ts', { exact: true }).uncheck();
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await expect(page.locator('#incoming-count')).toHaveText('0');
  await expect(page.locator('[data-node]')).toHaveCount(1);
  await expect(page.locator('[data-edge]')).toHaveCount(0);
});

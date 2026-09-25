import { test, expect } from '@playwright/test';

test('reselecting the focused node preserves all geometry and the zoomed camera', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#graph'), world = page.locator('#world');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 150, bounds.y + 250);
  const initialCamera = await world.getAttribute('transform');
  await page.mouse.wheel(0, -200);
  await expect(world).not.toHaveAttribute('transform', initialCamera!);
  const geometry = await world.innerHTML(), camera = await world.getAttribute('transform');
  const focused = page.getByRole('button', { name: 'Focus Document', exact: true });
  await focused.click();
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  await focused.press('Enter');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  expect(await world.innerHTML()).toBe(geometry);
  expect(await world.getAttribute('transform')).toBe(camera);
});

test('wheel and trackpad pinch keep the graph point under the cursor fixed, including after panning and at limits', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#graph');
  await expect(canvas).toHaveAttribute('data-state', 'settled');
  const bounds = (await canvas.boundingBox())!;
  const cursor = { x: Math.round(bounds.x + bounds.width * .28), y: Math.round(bounds.y + bounds.height * .36) };
  const world = page.locator('#world');
  const zoomAtCursor = async (delta: number, pinch = false) => {
    const before = await world.evaluate((el, cursor) => {
      const matrix = (el as SVGGraphicsElement).getScreenCTM()!;
      const point = new DOMPoint(cursor.x, cursor.y).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y, scale: matrix.a };
    }, cursor);
    await page.mouse.move(cursor.x, cursor.y);
    if (pinch) await page.keyboard.down('Control');
    try { await page.mouse.wheel(0, delta); }
    finally { if (pinch) await page.keyboard.up('Control'); }
    // Wheel delivery is asynchronous. Wait for an actual scale change before checking the anchor.
    await expect.poll(() => world.evaluate(el => (el as SVGGraphicsElement).getScreenCTM()!.a)).not.toBe(before.scale);
    const after = await world.evaluate((el, point) => {
      const matrix = (el as SVGGraphicsElement).getScreenCTM()!;
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y, scale: matrix.a };
    }, before);
    expect(after.x).toBeCloseTo(cursor.x, 3);
    expect(after.y).toBeCloseTo(cursor.y, 3);
    expect(delta < 0 ? after.scale > before.scale : after.scale < before.scale).toBe(true);
  };
  await zoomAtCursor(-180, true);
  await zoomAtCursor(100);
  // Pan from empty canvas, then verify the same invariant with a nonzero translation.
  await page.mouse.move(bounds.x + 40, bounds.y + 220);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 270);
  await page.mouse.up();
  await zoomAtCursor(-200, true);
  await zoomAtCursor(-100000, true); // Clamp to the upper zoom limit.
  const atLimit = await world.getAttribute('transform');
  const clampedEvent = canvas.evaluate(el => new Promise<void>(resolve => {
    el.addEventListener('wheel', () => requestAnimationFrame(() => resolve()), { once: true });
  }));
  await page.mouse.wheel(0, -500);
  await clampedEvent;
  expect(await world.getAttribute('transform')).toBe(atLimit);
  await zoomAtCursor(100000, true); // Clamp to the lower limit.
  expect(await world.getAttribute('transform')).not.toBe(atLimit);
});

test('measured cards fit their text and keep room between mixed widths and heights', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#graph');
  const checkCards = async () => {
    await expect(canvas).toHaveAttribute('data-state', 'settled');
    const cards = await page.locator('[data-node], [data-label]').evaluateAll(elements => elements.map(el => {
      const group = el as SVGGElement;
      const rect = group.querySelector('rect') as SVGRectElement | null;
      const width = rect ? rect.width.baseVal.value : Number(group.dataset.width);
      const height = rect ? rect.height.baseVal.value : Number(group.dataset.height);
      const content = group.querySelector('.card-content') as SVGGElement;
      const bounds = content.getBBox();
      const relative = group.getCTM()!.inverse().multiply(content.getCTM()!);
      const topLeft = new DOMPoint(bounds.x, bounds.y).matrixTransform(relative);
      const bottomRight = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(relative);
      const position = group.transform.baseVal.consolidate()!.matrix;
      return { id: group.dataset.node || group.dataset.label, label: !!group.dataset.label, width, height, x: position.e, y: position.f, left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
    }));
    expect(new Set(cards.filter(c => c.label).map(c => c.width)).size).toBeGreaterThan(2);
    expect(new Set(cards.filter(c => c.label).map(c => c.height)).size).toBeGreaterThan(1);
    // SVG glyph bounds can vary slightly with the final camera scale (font hinting).
    for (const card of cards) {
      expect(card.left, `${card.id} left padding`).toBeGreaterThanOrEqual(-card.width / 2 + 10);
      expect(card.right, `${card.id} right padding`).toBeLessThanOrEqual(card.width / 2 - 10);
      expect(card.top, `${card.id} top padding`).toBeGreaterThanOrEqual(-card.height / 2 + 10);
      expect(card.bottom, `${card.id} bottom padding`).toBeLessThanOrEqual(card.height / 2 - 10);
      if (card.label) expect(card.width - (card.right - card.left)).toBeLessThan(34);
    }
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]!, b = cards[j]!;
      const gap = Math.max(Math.abs(a.x - b.x) - (a.width + b.width) / 2, Math.abs(a.y - b.y) - (a.height + b.height) / 2);
      expect(gap, `${a.id}/${b.id} card clearance`).toBeGreaterThanOrEqual(39.5);
    }
  };
  await checkCards();
  await page.getByLabel('Jump to a node').selectOption('person');
  await page.getByLabel('Follow connections').selectOption('both');
  await checkCards();
  await page.getByLabel('Arrangement').selectOption('vertical');
  await checkCards();
});

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
      const head = group.querySelector('.edge-arrow') as SVGPathElement;
      const rect = document.querySelector(`[data-node="${group.getAttribute('data-target')}"] rect`) as SVGRectElement;
      const surface = document.querySelector(`[data-label="${group.getAttribute('data-edge')}"] .edge-surface`) as SVGPathElement;
      const incoming = group.querySelector('.edge-path') as SVGPathElement;
      const touchesSurface = (line: SVGPathElement, position: number) => {
        const p = line.getPointAtLength(position);
        const local = new DOMPoint(p.x, p.y).matrixTransform(line.getCTM()!).matrixTransform(surface.getCTM()!.inverse());
        return surface.isPointInStroke(local);
      };
      const joined = touchesSurface(incoming, incoming.getTotalLength()) && touchesSurface(path, 0);
      const size = rect.getBBox();
      const length = path.getTotalLength();
      const local = (line: SVGPathElement, distance: number) => {
        const p = line.getPointAtLength(distance);
        return new DOMPoint(p.x, p.y).matrixTransform(line.getCTM()!).matrixTransform(rect.getCTM()!.inverse());
      };
      const end = local(head, 0), base = local(path, length), before = local(path, Math.max(0, length - 1));
      const dx = end.x - base.x, dy = end.y - base.y;
      const tangentError = Math.abs(dx * (base.y - before.y) - dy * (base.x - before.x));
      const headPoints = head.getAttribute('d')!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
      const shaftEnd = path.getPointAtLength(length);
      const baseError = Math.hypot(shaftEnd.x - (headPoints[2]! + headPoints[4]!) / 2, shaftEnd.y - (headPoints[3]! + headPoints[5]!) / 2);
      const distance = (p: DOMPoint) => Math.hypot(Math.max(size.x - p.x, 0, p.x - size.x - size.width), Math.max(size.y - p.y, 0, p.y - size.y - size.height));
      return { id: group.getAttribute('data-edge'), joined, gap: distance(end), approachGap: distance(base), tangentError, baseError };
    }));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.joined, `${route.id} line must meet both label necks`).toBe(true);
      expect(route.gap, `${route.id} tip clearance`).toBeCloseTo(2.5, 1);
      expect(route.approachGap, `${route.id} must approach from outside`).toBeGreaterThan(route.gap);
      expect(route.baseError, `${route.id} shaft ends at arrow base`).toBeLessThan(.001);
      expect(route.tangentError, `${route.id} straight approach into arrowhead`).toBeLessThan(.01);
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

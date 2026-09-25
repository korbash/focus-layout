import { test, expect } from '@playwright/test';
import { edgeRoute } from '../demo/routing';

test('short links and differently proportioned cards never fold back between their ports', () => {
  const cases = [
    { source: { x: -220, y: -80, width: 100, height: 60 }, label: { x: 0, y: 0, width: 142, height: 44 }, target: { x: 150, y: 3, width: 122, height: 64 } },
    { source: { x: 155, y: -6, width: 122, height: 64 }, label: { x: 0, y: 0, width: 142, height: 44 }, target: { x: -150, y: -100, width: 100, height: 60 } },
    { source: { x: -135, y: -100, width: 80, height: 150 }, label: { x: 0, y: 0, width: 220, height: 44 }, target: { x: 90, y: 125, width: 85, height: 80 } },
    { source: { x: 0, y: 0, width: 100, height: 60 }, label: { x: -40, y: 100, width: 90, height: 70 }, target: { x: 0, y: 0, width: 100, height: 60 } },
  ];
  for (const { source, label, target } of cases) {
    const route = edgeRoute(source, target, label, source.x === target.x && source.y === target.y);
    for (const span of [route.before, route.after]) {
      const values = span.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
      expect(values).toHaveLength(12);
      const points = [0, 2, 4, 6, 8, 10].map(i => ({ x: values[i]!, y: values[i + 1]! }));
      // An ordered control polygon keeps the cubic monotone on both axes.
      for (const axis of ['x', 'y'] as const) {
        const sign = points[5]![axis] >= points[0]![axis] ? 1 : -1;
        for (let i = 1; i < 6; i++) expect((points[i]![axis] - points[i - 1]![axis]) * sign).toBeGreaterThanOrEqual(-.00001);
      }
    }
  }
});

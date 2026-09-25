import { test, expect } from '@playwright/test';
import { edgeRoute, routeEdges } from '../demo/routing';
import type { PositionedNode, PositionedEdge } from '../src/types';

test('incoming, outgoing and loop ports repel together, with stable ordering and bounded crowded sides', () => {
  const nodes: PositionedNode[] = [
    { id: 'hub', x: 0, y: 0, width: 160, height: 80, opacity: 1 },
    ...[-30, 0, 30].map((x, i) => ({ id: `n${i}`, x, y: 350, width: 100, height: 60, opacity: 1 })),
  ];
  const edges: PositionedEdge[] = [-12, 0, 12].map((x, i) => ({
    id: `e${i}`, source: i === 1 ? `n${i}` : 'hub', target: i === 1 ? 'hub' : `n${i}`,
    label: { width: 100, height: 44 }, labelPosition: { x, y: 160 }, opacity: 1,
  }));
  edges.push({ id: 'loop', source: 'hub', target: 'hub', label: { width: 100, height: 44 }, labelPosition: { x: 18, y: 130 }, opacity: 1 });
  for (const width of [160, 64]) {
    nodes[0]!.width = width;
    const routes = routeEdges(nodes, edges);
    const reverse = routeEdges([...nodes].reverse(), [...edges].reverse());
    const ports: number[] = [];
    const firstX = (path: string) => Number(path.match(/^M([^,]+)/)![1]);
    for (const edge of edges) {
      const route = routes.get(edge.id)!;
      expect(route).toEqual(reverse.get(edge.id));
      if (edge.source === 'hub') ports.push(firstX(route.before));
      if (edge.target === 'hub') ports.push(firstX(route.arrow));
    }
    ports.sort((a, b) => a - b);
    expect(ports).toHaveLength(5); // The self-loop occupies two distinct slots.
    for (const x of ports) expect(Math.abs(x)).toBeLessThanOrEqual(width / 2 - 20 + .001);
    for (let i = 1; i < ports.length; i++) expect(ports[i]! - ports[i - 1]!).toBeGreaterThanOrEqual(Math.min(16, (width - 40) / 4) - .001);
  }
});

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

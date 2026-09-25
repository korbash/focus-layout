import { Layout } from 'webcola';
import { selectNeighborhood } from './graph.js';
import type { EngineRequest, Frame, Point } from './types.js';

/** WebCola owns constraint solving. This adapter supplies focus and measured edge-label boxes. */
export function layoutFocus({ graph, focus, previous, options = {} }: EngineRequest): Frame {
  const selected = selectNeighborhood(graph, focus, options);
  const { gap = 28, linkDistance = 180, flow = 'free' } = options;
  if (!Number.isFinite(gap) || gap < 0) throw new Error('gap must be finite and nonnegative');
  if (!Number.isFinite(linkDistance) || linkDistance <= 0) throw new Error('linkDistance must be positive');
  if (!['free', 'horizontal', 'vertical'].includes(flow)) throw new Error('Invalid flow');
  // Labels also cost solver work; bounded graphs can still have many parallel edges.
  if (selected.nodes.length + selected.edges.filter(e => e.label).length > 400) {
    throw new Error('Layout exceeds 400 boxes; narrow the neighbourhood or filter edges');
  }
  const old = new Map(previous?.nodes.map(n => [n.id, n]) || []);
  const oldEdges = new Map(previous?.edges.map(e => [e.id, e]) || []);
  const center = old.get(focus) || { x: 0, y: 0 };
  const initial = new Map<string, Point>();
  for (const [i, n] of selected.nodes.entries()) {
    const prior = old.get(n.id);
    const edge = selected.edges.find(e => e.source === n.id && old.has(e.target) || e.target === n.id && old.has(e.source));
    const neighbor = edge && old.get(edge.source === n.id ? edge.target : edge.source);
    const anchor = neighbor || center;
    const angle = i * 2.399963229728653;
    initial.set(n.id, prior || { x: anchor.x + Math.cos(angle) * linkDistance, y: anchor.y + Math.sin(angle) * linkDistance });
  }
  initial.set(focus, center);
  const nodes = selected.nodes.map(n => ({
    ...initial.get(n.id)!, width: n.width + gap, height: n.height + gap, fixed: n.id === focus ? 1 : 0,
  }));
  const index = new Map(selected.nodes.map((n, i) => [n.id, i]));
  const labels = new Map<string, number>();
  const links: { source: number; target: number }[] = [];
  const pairCounts = new Map<string, number>();
  for (const e of selected.edges) {
    const source = index.get(e.source)!, target = index.get(e.target)!;
    if (e.label) {
      const a = nodes[source]!, b = nodes[target]!;
      const key = JSON.stringify([e.source, e.target].sort());
      const count = pairCounts.get(key) || 0; pairCounts.set(key, count + 1);
      const oldLabel = oldEdges.get(e.id)?.labelPosition;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const offset = (count % 2 ? -1 : 1) * (1 + Math.floor(count / 2)) * 60;
      labels.set(e.id, nodes.length);
      nodes.push({
        x: oldLabel?.x ?? (source === target ? a.x + linkDistance : (a.x + b.x) / 2 - dy / length * offset),
        y: oldLabel?.y ?? (source === target ? a.y - linkDistance / 2 : (a.y + b.y) / 2 + dx / length * offset),
        width: e.label.width + gap, height: e.label.height + gap, fixed: 0,
      });
      const label = nodes.length - 1;
      links.push({ source, target: label });
      if (source !== target) links.push({ source: label, target });
    } else if (source !== target) links.push({ source, target });
  }
  if (nodes.length > 1) {
    const layout = new Layout().nodes(nodes).links(links).avoidOverlaps(true).handleDisconnected(false).linkDistance(linkDistance);
    if (flow !== 'free') layout.flowLayout(flow === 'horizontal' ? 'x' : 'y', linkDistance / 2);
    // Bounded work, no DOM timer or synchronous convergence loop in WebCola's kick().
    layout.start(20, 30, 80, 0, false, false);
  }
  const anchor = nodes[index.get(focus)!]!;
  const position = (n: Point): Point => ({ x: n.x - anchor.x, y: n.y - anchor.y });
  for (const n of nodes) if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error('Layout did not produce finite positions');
  return {
    focus, omitted: selected.omitted,
    nodes: selected.nodes.map((n, i) => ({ ...n, ...position(nodes[i]!), opacity: 1 })),
    edges: selected.edges.map(e => ({ ...e, opacity: 1, labelPosition: labels.has(e.id) ? position(nodes[labels.get(e.id)!]!) : undefined })),
  };
}

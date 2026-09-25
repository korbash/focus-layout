import type { Frame, Point, PositionedNode, PositionedEdge } from './types.js';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const point = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Pure, time-independent sampling. `from` may be a partially animated frame. */
export function transitionFrame(from: Frame, to: Frame, progress: number): Frame {
  if (!Number.isFinite(progress)) throw new Error('progress must be finite');
  if (progress <= 0) return structuredClone(from);
  if (progress >= 1) return structuredClone(to);
  const t = smoothstep(progress);
  const before = new Map(from.nodes.map(n => [n.id, n]));
  const after = new Map(to.nodes.map(n => [n.id, n]));
  const beforeEdges = new Map(from.edges.map(e => [e.id, e]));
  const afterEdges = new Map(to.edges.map(e => [e.id, e]));
  const findAnchor = (id: string): Point => {
    const edge = to.edges.find(e => e.source === id && before.has(e.target) || e.target === id && before.has(e.source));
    return edge ? before.get(edge.source === id ? edge.target : edge.source)! : before.get(to.focus) || { x: 0, y: 0 };
  };
  const nodes: PositionedNode[] = [];
  for (const n of to.nodes) {
    const start = before.get(n.id);
    nodes.push({ ...n, ...point(start || findAnchor(n.id), n, t),
      width: mix(start?.width ?? n.width, n.width, t), height: mix(start?.height ?? n.height, n.height, t),
      opacity: mix(start?.opacity ?? 0, 1, t) });
  }
  for (const n of from.nodes) if (!after.has(n.id)) nodes.push({ ...n, opacity: n.opacity * (1 - t) });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges: PositionedEdge[] = to.edges.map(e => {
    const start = beforeEdges.get(e.id);
    // Retargeted edge ids are treated as new links (host should prefer stable semantic ids).
    const same = start?.source === e.source && start?.target === e.target;
    const a = byId.get(e.source)!, b = byId.get(e.target)!;
    const origin = same && start.labelPosition || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { ...e, opacity: mix(same ? start.opacity : 0, 1, t),
      label: e.label && { width: mix(same ? start.label?.width ?? e.label.width : e.label.width, e.label.width, t), height: mix(same ? start.label?.height ?? e.label.height : e.label.height, e.label.height, t) },
      labelPosition: e.labelPosition ? point(origin, e.labelPosition, t) : undefined };
  });
  for (const e of from.edges) if (!afterEdges.has(e.id)) edges.push({ ...e, opacity: e.opacity * (1 - t) });
  return { focus: to.focus, omitted: to.omitted, nodes, edges };
}

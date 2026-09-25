import type { Graph, FocusOptions, Selection } from './types.js';

export function validateGraph(graph: Graph): void {
  const nodes = new Set<string>(), edges = new Set<string>();
  const size = (s: { width: number; height: number }, id: string) => {
    if (![s.width, s.height].every(n => Number.isFinite(n) && n > 0)) throw new Error(`Invalid dimensions: ${id}`);
  };
  for (const n of graph.nodes) {
    if (typeof n.id !== 'string' || !n.id || nodes.has(n.id)) throw new Error(`Invalid or duplicate node id: ${n.id}`);
    nodes.add(n.id); size(n, n.id);
  }
  for (const e of graph.edges) {
    if (typeof e.id !== 'string' || !e.id || edges.has(e.id)) throw new Error(`Invalid or duplicate edge id: ${e.id}`);
    if (!nodes.has(e.source) || !nodes.has(e.target)) throw new Error(`Missing endpoint: ${e.id}`);
    edges.add(e.id); if (e.label) size(e.label, e.id);
  }
}

/** Breadth-first selection on semantic nodes only. Cycles and parallel edges are retained. */
export function selectNeighborhood(graph: Graph, focus: string, options: FocusOptions = {}): Selection {
  validateGraph(graph);
  if (!graph.nodes.some(n => n.id === focus)) throw new Error(`Unknown focus: ${focus}`);
  const { depth = 2, direction = 'out', maxNodes = 60 } = options;
  if (!Number.isInteger(depth) || depth < 0 || depth > 20) throw new Error('depth must be an integer in [0, 20]');
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 200) throw new Error('maxNodes must be an integer in [1, 200]');
  if (!['in', 'out', 'both'].includes(direction)) throw new Error('Invalid direction');
  const allowed = options.edgeIds ? new Set(options.edgeIds) : undefined;
  const edges = graph.edges.filter(e => !allowed || allowed.has(e.id));
  const neighbors = new Map<string, Set<string>>();
  const add = (a: string, b: string) => { if (!neighbors.has(a)) neighbors.set(a, new Set()); neighbors.get(a)!.add(b); };
  for (const e of edges) {
    if (direction !== 'in') add(e.source, e.target);
    if (direction !== 'out') add(e.target, e.source);
  }
  const reached = new Map<string, number>([[focus, 0]]), queue = [focus];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!, distance = reached.get(id)!;
    if (distance >= depth) continue;
    for (const next of [...(neighbors.get(id) || [])].sort()) {
      if (!reached.has(next)) { reached.set(next, distance + 1); queue.push(next); }
    }
  }
  const visible = new Set(queue.slice(0, maxNodes));
  return {
    focus, omitted: Math.max(0, queue.length - visible.size),
    nodes: graph.nodes.filter(n => visible.has(n.id)).map(n => ({ ...n })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.filter(e => visible.has(e.source) && visible.has(e.target)).map(e => ({ ...e, label: e.label && { ...e.label } })),
  };
}

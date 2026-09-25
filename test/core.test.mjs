import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExplorer, layoutFocus, selectNeighborhood, transitionFrame } from '../dist/index.js';

const graph = {
  nodes: ['a', 'b', 'c', 'd', 'x'].map(id => ({ id, width: 120, height: 64 })),
  edges: [
    { id: 'ab', source: 'a', target: 'b', label: { width: 160, height: 52 } },
    { id: 'ab2', source: 'a', target: 'b', label: { width: 180, height: 52 } },
    { id: 'bc', source: 'b', target: 'c' }, { id: 'ca', source: 'c', target: 'a' },
    { id: 'bd', source: 'b', target: 'd' }, { id: 'aa', source: 'a', target: 'a', label: { width: 120, height: 42 } },
  ],
};
const ids = s => s.nodes.map(n => n.id).sort();
const request = (focus = 'a', previous, options = {}) => ({ graph, focus, previous, options });
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

test('directed BFS retains cycles, parallel edges and loops without counting label boxes as hops', () => {
  assert.deepEqual(ids(selectNeighborhood(graph, 'a', { depth: 0 })), ['a']);
  assert.deepEqual(ids(selectNeighborhood(graph, 'a', { depth: 1 })), ['a', 'b']);
  assert.deepEqual(ids(selectNeighborhood(graph, 'a', { depth: 1, direction: 'in' })), ['a', 'c']);
  assert.deepEqual(ids(selectNeighborhood(graph, 'a', { depth: 1, direction: 'both' })), ['a', 'b', 'c']);
  assert.equal(selectNeighborhood(graph, 'a', { depth: 2 }).edges.length, 6);
});
test('selection filters and explicit truncation preserve original data', () => {
  const frozen = freeze(structuredClone(graph));
  const selection = selectNeighborhood(frozen, 'a', { maxNodes: 2 });
  assert.equal(selection.omitted, 2);
  assert.deepEqual(ids(selection), ['a', 'b']);
  assert.equal(selectNeighborhood(frozen, 'a', { edgeIds: [] }).nodes.length, 1);
  assert.throws(() => selectNeighborhood(graph, 'missing'), /Unknown focus/);
  assert.throws(() => selectNeighborhood(graph, 'a', { depth: NaN }), /depth/);
  assert.throws(() => selectNeighborhood({ nodes: graph.nodes, edges: [{ id: 'bad', source: 'a', target: 'missing' }] }, 'a'), /endpoint/);
});
test('WebCola lays out measured boxes, centres focus, preserves loops, and does not mutate input', () => {
  const frozen = freeze(structuredClone(graph));
  const result = layoutFocus({ graph: frozen, focus: 'a', options: { direction: 'both' } });
  assert.equal(result.nodes.find(n => n.id === 'a').x, 0);
  assert.equal(result.nodes.find(n => n.id === 'a').y, 0);
  const boxes = [...result.nodes, ...result.edges.filter(e => e.label).map(e => ({ ...e.label, ...e.labelPosition }))];
  for (const b of boxes) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 - 0.1 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 - 0.1, `boxes ${i}/${j} overlap`);
  }
  assert.equal(result.edges.length, 6);
  assert.deepEqual(result, layoutFocus({ graph: frozen, focus: 'a', options: { direction: 'both' } }));
});
test('refocus handles cycles and disconnected graph without nonfinite geometry', () => {
  let frame = layoutFocus(request());
  for (const focus of ['b', 'c', 'x', 'a']) {
    frame = layoutFocus(request(focus, frame, { direction: 'both', flow: 'horizontal' }));
    assert.ok(frame.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
    assert.deepEqual([frame.nodes.find(n => n.id === focus).x, frame.nodes.find(n => n.id === focus).y], [0, 0]);
  }
});
test('transitions fade additions/removals and accept partially animated frames', () => {
  const a = layoutFocus(request('a', undefined, { depth: 1 })), b = layoutFocus(request('c', a, { depth: 1 }));
  const middle = transitionFrame(a, b, 0.5);
  assert.equal(middle.nodes.find(n => n.id === 'b').opacity, 0.5);
  assert.equal(middle.nodes.find(n => n.id === 'c').opacity, 0.5);
  const next = layoutFocus(request('b', middle));
  assert.deepEqual(transitionFrame(middle, next, 0), middle);
  assert.deepEqual(transitionFrame(middle, next, 1), next);
  assert.ok(middle.edges.every(e => middle.nodes.some(n => n.id === e.source) && middle.nodes.some(n => n.id === e.target)));
});
function manualClock() {
  let time = 0, seq = 0; const tasks = new Map();
  return {
    now: () => time, request: fn => { tasks.set(++seq, fn); return seq; }, cancel: id => tasks.delete(id),
    tick: delta => { time += delta; const list = [...tasks.values()]; tasks.clear(); list.forEach(fn => fn(time)); },
    count: () => tasks.size,
  };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
test('identical focus reuses the settled frame but changed settings and graph invalidate it', async () => {
  let calls = 0, publishes = 0;
  const explorer = createExplorer(graph, { duration: 0, onFrame: () => publishes++, engine: req => { calls++; return layoutFocus(req); } });
  const edgeIds = graph.edges.map(e => e.id);
  const first = await explorer.focus('a', { edgeIds });
  const repeated = await explorer.focus('a', { edgeIds: [...edgeIds].reverse(), depth: 2, direction: 'out', duration: 200 });
  assert.equal(calls, 1); assert.equal(publishes, 1);
  assert.deepEqual(repeated, first);
  repeated.frame.nodes.length = 0;
  assert.ok(explorer.snapshot().nodes.length > 0);
  await explorer.focus('a', { depth: 1 }); assert.equal(calls, 2);
  await explorer.focus('a', { edgeIds: [] }); assert.equal(calls, 3);
  const changed = structuredClone(graph); changed.nodes[0].width += 40;
  explorer.setGraph(changed);
  await explorer.focus('a'); assert.equal(calls, 4);
  assert.equal(explorer.snapshot().nodes[0].width, changed.nodes[0].width);
});
test('identical pending and animating focus shares the transition without cancelling or restarting it', async () => {
  const clock = manualClock(); let calls = 0;
  const explorer = createExplorer(graph, { clock, duration: 100, onFrame: () => {}, engine: req => { calls++; return layoutFocus(req); } });
  const first = explorer.focus('a');
  const pending = explorer.focus('a');
  await flush(); clock.tick(40);
  const midpoint = explorer.snapshot();
  const animating = explorer.focus('a', { duration: 300 });
  assert.deepEqual(explorer.snapshot(), midpoint);
  assert.equal(clock.count(), 1); assert.equal(calls, 1);
  clock.tick(60);
  const results = await Promise.all([first, pending, animating]);
  assert.ok(results.every(r => r.status === 'finished'));
  assert.equal(clock.count(), 0);
  results[0].frame.nodes.length = 0;
  assert.ok(results[1].frame.nodes.length > 0);
  const interrupted = explorer.focus('b');
  const joined = explorer.focus('b'); await flush(); clock.tick(20);
  explorer.cancel();
  assert.equal((await interrupted).status, 'cancelled');
  assert.equal((await joined).status, 'cancelled');
  await explorer.focus('b', { duration: 0 }); assert.equal(calls, 3);
});
test('failed focus is retried instead of being reused', async () => {
  let calls = 0;
  const explorer = createExplorer(graph, { duration: 0, onFrame: () => {}, engine: req => {
    if (++calls === 1) throw new Error('temporary');
    return layoutFocus(req);
  } });
  await assert.rejects(explorer.focus('a'), /temporary/);
  assert.equal((await explorer.focus('a')).status, 'finished');
  assert.equal(calls, 2);
});
test('a click mid-transition cancels prior work and continues from the displayed frame', async () => {
  const clock = manualClock(), frames = [];
  const explorer = createExplorer(graph, { clock, duration: 100, onFrame: f => frames.push(f) });
  await explorer.focus('a', { duration: 0 });
  const first = explorer.focus('b'); await flush(); clock.tick(40);
  const midpoint = explorer.snapshot();
  const second = explorer.focus('c'); await flush(); clock.tick(0);
  assert.equal((await first).status, 'cancelled');
  assert.deepEqual(explorer.snapshot(), midpoint);
  clock.tick(100);
  assert.equal((await second).status, 'finished');
  assert.equal(explorer.snapshot().focus, 'c');
  assert.equal(clock.count(), 0);
  explorer.destroy();
  assert.throws(() => explorer.focus('a'), /destroyed/);
});
test('worker-style stale responses never overwrite a newer focus', async () => {
  const pending = new Map(), frames = [];
  const explorer = createExplorer(graph, { duration: 0, onFrame: f => frames.push(f), engine: request => new Promise(resolve => pending.set(request.focus, () => resolve(layoutFocus(request)))) });
  const a = explorer.focus('a'); await flush();
  const b = explorer.focus('b'); await flush();
  pending.get('b')(); await b; pending.get('a')(); await flush();
  assert.equal((await a).status, 'cancelled');
  assert.equal(frames.length, 1); assert.equal(frames[0].focus, 'b');
});
test('errors reject, subscriptions receive copies, graph replacement cancels, reduced motion needs no browser', async () => {
  const explorer = createExplorer(graph, { onFrame: f => { f.nodes.length = 0; }, duration: 0 });
  await explorer.focus('a'); assert.ok(explorer.snapshot().nodes.length > 0);
  await assert.rejects(explorer.focus('a', { gap: -1 }), /gap/);
  const f = explorer.focus('b'); explorer.setGraph(graph); assert.equal((await f).status, 'cancelled');
  const broken = createExplorer(graph, { onFrame: () => { throw new Error('render'); }, duration: 0 });
  await assert.rejects(broken.focus('a'), /render/);
});

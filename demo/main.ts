import { measureCard, type Card } from './cards';
import { routeEdges } from './routing';
import { createExplorer, type Frame, type Graph, type LayoutOptions } from '../src/index';

const nodeInfo: Record<string, { name: string; file: string; description: string }> = {
  document: { name: 'Document', file: 'content.ts', description: 'A shared piece of knowledge. Follow its author, topics, and revision history.' },
  person: { name: 'Person', file: 'identity.ts', description: 'A person behind the work. People belong to teams and can mentor one another.' },
  team: { name: 'Team', file: 'identity.ts', description: 'People working together. Each team has a lead and a home workspace.' },
  workspace: { name: 'Workspace', file: 'content.ts', description: 'A common space that brings people, documents, and ideas together.' },
  topic: { name: 'Topic', file: 'content.ts', description: 'An idea that connects documents. Related topics can form cycles.' },
  status: { name: 'Status', file: 'activity.ts', description: 'Where a document is in its lifecycle: draft, in review, or published.' },
  revision: { name: 'Revision', file: 'activity.ts', description: 'A recorded change with an author and a reference to the original document.' },
  country: { name: 'Country', file: 'identity.ts', description: 'A geographical context shared by people around the world.' },
};
const colors: Record<string, string> = { 'identity.ts': '#73a184', 'content.ts': '#6b95ab', 'activity.ts': '#c2a16c' };
const connections = [
  ['author', 'document', 'person', 'content.ts', 'The person who first wrote this document.'],
  ['reviewer', 'document', 'person', 'content.ts', 'The person responsible for reviewing this document.'],
  ['topic', 'document', 'topic', 'content.ts', 'The primary topic explored in the document.'],
  ['status', 'document', 'status', 'activity.ts', 'The current publication state.'],
  ['revision', 'document', 'revision', 'activity.ts', 'The latest revision of this document.'],
  ['editor', 'revision', 'person', 'activity.ts', 'The author of a particular revision.'],
  ['original', 'revision', 'document', 'activity.ts', 'Back to the document: this connection forms a cycle.'],
  ['team', 'person', 'team', 'identity.ts', 'The team a person belongs to.'],
  ['country', 'person', 'country', 'identity.ts', 'The country this person works from.'],
  ['mentor', 'person', 'person', 'identity.ts', 'A person can mentor another person: a self-loop in the type graph.'],
  ['lead', 'team', 'person', 'identity.ts', 'The person leading the team.'],
  ['workspace', 'team', 'workspace', 'content.ts', 'The workspace where the team collaborates.'],
  ['featured', 'workspace', 'document', 'content.ts', 'The featured document of a workspace.'],
  ['related', 'topic', 'topic', 'content.ts', 'Topics can refer to other topics.'],
] as const;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('graph') as unknown as SVGSVGElement;
const world = document.getElementById('world')!;
const ns = 'http://www.w3.org/2000/svg';
const element = (tag: string, attrs: Record<string, string> = {}) => {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
// Sample richer metrics exercise wrapping and different card heights.
const descriptions: Record<string, string> = {
  reviewer: 'Assigned reviewer before publication.',
  revision: 'Latest saved version, including unpublished changes.',
  mentor: 'Optional link to another person.',
};
await document.fonts.ready;
const nodeCards = new Map(Object.entries(nodeInfo).map(([id, info]) => [id, measureCard(svg, 'node', info.name, 'DIMENSION')]));
const edgeCards = new Map<string, Card>(connections.map(([id, source, target, file]) => [id, measureCard(svg, 'edge-label', id, `${nodeInfo[source]!.name} → ${nodeInfo[target]!.name}`, colors[file], descriptions[id])]));
const graph: Graph = {
  nodes: [...nodeCards].map(([id, { width, height }]) => ({ id, width, height })),
  edges: connections.map(([id, source, target]) => {
    const { width, height } = edgeCards.get(id)!;
    return { id, source, target, label: { width, height } };
  }),
};
const nodeElements = new Map<string, Element>(), edgeElements = new Map<string, Element>(), labelElements = new Map<string, Element>();
let frame: Frame = { focus: '', nodes: [], edges: [], omitted: 0 };
let focus = 'document', depth = 2, zoom = 1, fitted = 1, pan = { x: 0, y: 0 };
let history: string[] = [], generation = 0;
const enabled = new Set(Object.keys(colors));
const jump = $<HTMLSelectElement>('jump');
for (const [id, info] of Object.entries(nodeInfo)) { const option = document.createElement('option'); option.value = id; option.textContent = info.name; jump.append(option); }
for (const [file, color] of Object.entries(colors)) {
  const label = document.createElement('label'); label.className = 'file';
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.setAttribute('aria-label', file);
  input.onchange = () => { input.checked ? enabled.add(file) : enabled.delete(file); $('file-count').textContent = `${enabled.size} files`; void refocus(focus, false); };
  const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = color;
  label.append(input, document.createTextNode(file), swatch); $('files').append(label);
}
function details(id: string, edge = false) {
  const info = nodeInfo[id]!;
  const connection = edge && connections.find(e => e[0] === id);
  $('detail-kind').textContent = edge ? 'CONNECTION' : 'IN FOCUS';
  $('detail-title').textContent = connection ? connection[0] : info.name;
  $('detail-icon').textContent = connection ? '↗' : info.name[0]!;
  $('detail-description').textContent = connection ? connection[4] : info.description;
  $('detail-file').textContent = connection ? connection[3] : info.file;
  $('detail-type-label').textContent = connection ? 'Signature' : 'Connections';
  $('detail-type').textContent = connection ? `${nodeInfo[connection[1]]!.name} → ${nodeInfo[connection[2]]!.name}` : `${graph.edges.filter(e => e.source === id).length} outgoing · ${graph.edges.filter(e => e.target === id).length} incoming`;
}
function draw(next: Frame) {
  frame = next;
  const byId = new Map(next.nodes.map(n => [n.id, n]));
  for (const [id, el] of nodeElements) if (!byId.has(id)) { el.remove(); nodeElements.delete(id); }
  const edges = new Set(next.edges.map(e => e.id));
  for (const collection of [edgeElements, labelElements]) for (const [id, el] of collection) if (!edges.has(id)) { el.remove(); collection.delete(id); }
  for (const n of next.nodes) {
    let el = nodeElements.get(n.id);
    if (!el) {
      el = element('g', { role: 'button', tabindex: '0', 'aria-label': `Focus ${nodeInfo[n.id]!.name}`, 'data-node': n.id });
      el.append(element('rect', { class: 'surface', rx: '18', x: String(-n.width / 2), y: String(-n.height / 2), width: String(n.width), height: String(n.height) }));
      el.append(nodeCards.get(n.id)!.content.cloneNode(true));
      el.addEventListener('click', () => void refocus(n.id));
      el.addEventListener('keydown', (event: Event) => { const e = event as KeyboardEvent; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void refocus(n.id); } });
      document.getElementById('nodes')!.append(el); nodeElements.set(n.id, el);
    }
    el.setAttribute('class', `node${n.id === next.focus ? ' focus' : ''}`);
    el.setAttribute('transform', `translate(${n.x},${n.y})`); el.setAttribute('opacity', String(n.opacity));
    (el as SVGElement).style.pointerEvents = n.opacity < .1 ? 'none' : 'auto';
  }
  const routes = routeEdges(next.nodes, next.edges);
  for (const e of next.edges) {
    const a = byId.get(e.source)!, b = byId.get(e.target)!;
    const label = e.labelPosition || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const info = connections.find(c => c[0] === e.id)!;
    let path = edgeElements.get(e.id);
    if (!path) {
      path = element('g', { 'data-edge': e.id, 'data-target': e.target });
      path.append(element('path', { class: 'edge-path', stroke: colors[info[3]]! }));
      path.append(element('path', { class: 'edge-path edge-target', stroke: colors[info[3]]! }));
      path.append(element('path', { class: 'edge-arrow', fill: colors[info[3]]! }));
      document.getElementById('edges')!.append(path); edgeElements.set(e.id, path);
    }
    const route = routes.get(e.id)!;
    path.children[0]!.setAttribute('d', route.before);
    path.children[1]!.setAttribute('d', route.after);
    path.children[2]!.setAttribute('d', route.arrow);
    path.setAttribute('opacity', String(e.opacity));
    let el = labelElements.get(e.id);
    if (!el) {
      el = element('g', { class: 'edge-label', role: 'button', tabindex: '0', 'aria-label': `Inspect ${e.id}`, 'data-label': e.id, 'data-width': String(e.label!.width), 'data-height': String(e.label!.height) });
      el.append(element('path', { class: 'edge-surface', stroke: colors[info[3]]! }));
      el.append(edgeCards.get(e.id)!.content.cloneNode(true));
      el.addEventListener('click', () => details(e.id, true));
      el.addEventListener('keydown', (event: Event) => { const k = event as KeyboardEvent; if (k.key === 'Enter') details(e.id, true); });
      document.getElementById('labels')!.append(el); labelElements.set(e.id, el);
    }
    el.querySelector('.edge-surface')!.setAttribute('d', route.surface);
    el.setAttribute('transform', `translate(${label.x},${label.y})`); el.setAttribute('opacity', String(e.opacity));
  }
  camera();
  $('stats').textContent = `${next.nodes.filter(n => n.opacity > .5).length} nodes · ${next.edges.filter(e => e.opacity > .5).length} connections${next.omitted ? ` · ${next.omitted} more outside limit` : ''}`;
}
function camera() {
  const { width, height } = svg.getBoundingClientRect();
  const boxes = [...frame.nodes, ...frame.edges.filter(e => e.labelPosition).map(e => ({ ...e.label!, ...e.labelPosition! }))];
  const w = Math.max(300, ...boxes.map(n => Math.abs(n.x) + n.width / 2 + 50)) * 2;
  const h = Math.max(220, ...boxes.map(n => Math.abs(n.y) + n.height / 2 + 50)) * 2;
  fitted = Math.min(1.1, (width - 40) / w, (height - 160) / h);
  world.setAttribute('transform', `translate(${width / 2 + pan.x},${height / 2 + pan.y}) scale(${fitted * zoom})`);
}
const explorer = createExplorer(graph, { onFrame: draw, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 550 });
async function refocus(id: string, push = true) {
  const version = ++generation;
  if (push && focus !== id) history.push(focus);
  focus = id; jump.value = id; $('focus-name').textContent = nodeInfo[id]!.name;
  $('back').toggleAttribute('disabled', !history.length); details(id);
  updateDirectionControls();
  $('api-call').textContent = `explorer.focus('${id}', {\n  depth: ${depth},\n  direction: '${$<HTMLSelectElement>('direction').value}'\n})`;
  $('error').hidden = true; svg.dataset.state = 'moving';
  const options: LayoutOptions = { linkDistance: 120, gap: 40, depth, direction: ($<HTMLSelectElement>('direction').value as 'out'), flow: ($<HTMLSelectElement>('flow').value as 'free'), edgeIds: connections.filter(c => enabled.has(c[3])).map(c => c[0]) };
  try { await explorer.focus(id, options); if (version === generation) svg.dataset.state = 'settled'; }
  catch (e) { $('error').textContent = String(e); $('error').hidden = false; svg.dataset.state = 'error'; }
}
function updateDirectionControls() {
  const direction = $<HTMLSelectElement>('direction').value;
  const incoming = connections.filter(e => enabled.has(e[3]) && e[2] === focus && e[1] !== focus).length;
  const outgoing = connections.filter(e => enabled.has(e[3]) && e[1] === focus && e[2] !== focus).length;
  for (const mode of ['in', 'out', 'both']) {
    const button = $<HTMLButtonElement>(`show-${mode}`);
    button.setAttribute('aria-pressed', String(mode === direction));
    button.classList.toggle('selected', mode === direction);
  }
  $('incoming-count').textContent = String(incoming);
  $('outgoing-count').textContent = String(outgoing);
  const message = $('direction-hint');
  message.hidden = !(direction === 'out' && incoming > 0);
  $('direction-hint-text').textContent = outgoing === 0
    ? `No outgoing connections to other nodes. ${incoming} incoming ${incoming === 1 ? 'connection is' : 'connections are'} outside this view.`
    : `${incoming} incoming ${incoming === 1 ? 'connection' : 'connections'} to this node. Explore both directions to see more context.`;
}
function chooseDirection(mode: string) {
  $<HTMLSelectElement>('direction').value = mode;
  void refocus(focus, false);
}
for (const mode of ['in', 'out', 'both']) $(`show-${mode}`).onclick = () => chooseDirection(mode);
$('reveal-incoming').onclick = () => chooseDirection('both');
jump.onchange = () => void refocus(jump.value);
$('back').onclick = () => { const id = history.pop(); if (id) void refocus(id, false); };
$('depth').onclick = e => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-depth]'); if (!button) return; depth = Number(button.dataset.depth); $('depth').querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button)); void refocus(focus, false); };
for (const id of ['direction', 'flow']) $(id).onchange = () => void refocus(focus, false);
$('zoom-in').onclick = () => { zoom = Math.min(3, zoom * 1.2); camera(); };
$('zoom-out').onclick = () => { zoom = Math.max(.3, zoom / 1.2); camera(); };
$('fit').onclick = () => { pan = { x: 0, y: 0 }; zoom = 1; camera(); };
let drag: { x: number; y: number } | undefined;
svg.addEventListener('pointerdown', e => { if ((e.target as Element).closest('.node,.edge-label')) return; drag = { x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); });
svg.addEventListener('pointermove', e => { if (!drag) return; pan.x += e.clientX - drag.x; pan.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; camera(); });
svg.addEventListener('pointerup', () => { drag = undefined; }); svg.addEventListener('pointercancel', () => { drag = undefined; });
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const bounds = svg.getBoundingClientRect();
  const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? bounds.height : 1);
  const nextZoom = Math.max(.3, Math.min(3, zoom * Math.exp(-delta * .001)));
  const ratio = nextZoom / zoom;
  const x = e.clientX - bounds.left - bounds.width / 2;
  const y = e.clientY - bounds.top - bounds.height / 2;
  // Keep the world point beneath the cursor fixed, including after panning and at zoom limits.
  pan.x = x - (x - pan.x) * ratio;
  pan.y = y - (y - pan.y) * ratio;
  zoom = nextZoom;
  camera();
}, { passive: false });
new ResizeObserver(camera).observe(svg);
void refocus(focus, false);

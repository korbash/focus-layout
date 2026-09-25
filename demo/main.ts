import { edgeRoute } from './routing';
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
const graph: Graph = {
  nodes: Object.keys(nodeInfo).map(id => ({ id, width: 122, height: 64 })),
  edges: connections.map(([id, source, target]) => ({ id, source, target, label: { width: 142, height: 44 } })),
};
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('graph') as unknown as SVGSVGElement;
const world = document.getElementById('world')!;
const ns = 'http://www.w3.org/2000/svg';
const element = (tag: string, attrs: Record<string, string> = {}) => {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const text = (parent: Element, content: string, attrs: Record<string, string>) => { const t = element('text', attrs); t.textContent = content; parent.append(t); };
for (const [file, color] of Object.entries(colors)) {
  const marker = element('marker', { id: `arrow-${file.replace('.', '-')}`, viewBox: '0 0 12 12', markerWidth: '12', markerHeight: '12', refX: '11', refY: '6', orient: 'auto', markerUnits: 'userSpaceOnUse', overflow: 'visible' });
  marker.append(element('path', { d: 'M1,1 L11,6 L1,11 L4,6 Z', fill: color }));
  svg.querySelector('defs')!.append(marker);
}
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
      el.append(element('rect', { class: 'surface', rx: '18', x: '-61', y: '-32', width: '122', height: '64' }));
      text(el, 'DIMENSION', { class: 'node-category', 'text-anchor': 'middle', y: '-9' });
      text(el, nodeInfo[n.id]!.name, { 'text-anchor': 'middle', y: '13' });
      el.addEventListener('click', () => void refocus(n.id));
      el.addEventListener('keydown', (event: Event) => { const e = event as KeyboardEvent; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void refocus(n.id); } });
      document.getElementById('nodes')!.append(el); nodeElements.set(n.id, el);
    }
    el.setAttribute('class', `node${n.id === next.focus ? ' focus' : ''}`);
    el.setAttribute('transform', `translate(${n.x},${n.y})`); el.setAttribute('opacity', String(n.opacity));
    (el as SVGElement).style.pointerEvents = n.opacity < .1 ? 'none' : 'auto';
  }
  for (const e of next.edges) {
    const a = byId.get(e.source)!, b = byId.get(e.target)!;
    const label = e.labelPosition || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const info = connections.find(c => c[0] === e.id)!;
    let path = edgeElements.get(e.id);
    if (!path) {
      path = element('g', { 'data-edge': e.id, 'data-target': e.target });
      path.append(element('path', { class: 'edge-path', stroke: colors[info[3]]! }));
      path.append(element('path', { class: 'edge-path edge-target', stroke: colors[info[3]]!, 'marker-end': `url(#arrow-${info[3].replace('.', '-')})` }));
      document.getElementById('edges')!.append(path); edgeElements.set(e.id, path);
    }
    const route = edgeRoute(a, b, { ...label, ...(e.label || { width: 1, height: 1 }) }, e.source === e.target);
    path.children[0]!.setAttribute('d', route.before);
    path.children[1]!.setAttribute('d', route.after);
    path.setAttribute('opacity', String(e.opacity));
    let el = labelElements.get(e.id);
    if (!el) {
      el = element('g', { class: 'edge-label', role: 'button', tabindex: '0', 'aria-label': `Inspect ${e.id}`, 'data-label': e.id });
      el.append(element('rect', { x: '-71', y: '-22', width: '142', height: '44', rx: '8' }));
      el.append(element('circle', { class: 'dot', cx: '-56', cy: '-6', r: '3', fill: colors[info[3]]! }));
      text(el, e.id, { class: 'edge-name', x: '-46', y: '-2' });
      text(el, `${nodeInfo[e.source]!.name} → ${nodeInfo[e.target]!.name}`, { class: 'edge-type', x: '-56', y: '12' });
      el.addEventListener('click', () => details(e.id, true));
      el.addEventListener('keydown', (event: Event) => { const k = event as KeyboardEvent; if (k.key === 'Enter') details(e.id, true); });
      document.getElementById('labels')!.append(el); labelElements.set(e.id, el);
    }
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
  const options: LayoutOptions = { linkDistance: 95, gap: 22, depth, direction: ($<HTMLSelectElement>('direction').value as 'out'), flow: ($<HTMLSelectElement>('flow').value as 'free'), edgeIds: connections.filter(c => enabled.has(c[3])).map(c => c[0]) };
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
svg.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(.3, Math.min(3, zoom * Math.exp(-e.deltaY * .001))); camera(); }, { passive: false });
new ResizeObserver(camera).observe(svg);
void refocus(focus, false);

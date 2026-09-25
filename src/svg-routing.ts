import type { Point, Size, PositionedNode, PositionedEdge } from './types.js';

type Box = Point & Size;
type Port = Point & { nx: number; ny: number };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

// Choose a facing pair together, using free space between the actual card boundaries.
// Independent centre-to-centre choices can send a short link around two different sides.
function facingPorts(a: Box, b: Box, paddingA: number, paddingB: number, lane = 0): [Port, Port] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const horizontal = Math.abs(dx) - (a.width + b.width) / 2 >= Math.abs(dy) - (a.height + b.height) / 2;
  const sign = (horizontal ? dx : dy) < 0 ? -1 : 1;
  const ca = horizontal ? a.y : a.x, cb = horizontal ? b.y : b.x;
  const ra = Math.max(0, (horizontal ? a.height : a.width) / 2 - paddingA);
  const rb = Math.max(0, (horizontal ? b.height : b.width) / 2 - paddingB);
  const low = Math.max(ca - ra, cb - rb), high = Math.min(ca + ra, cb + rb);
  const shared = low <= high ? clamp((ca + cb) / 2, low, high) + lane * (high - low) / 2 : (ca + cb) / 2;
  const pa = clamp(shared, ca - ra, ca + ra), pb = clamp(shared, cb - rb, cb + rb);
  return horizontal ? [
    { x: a.x + sign * a.width / 2, y: pa, nx: sign, ny: 0 },
    { x: b.x - sign * b.width / 2, y: pb, nx: -sign, ny: 0 },
  ] : [
    { x: pa, y: a.y + sign * a.height / 2, nx: 0, ny: sign },
    { x: pb, y: b.y - sign * b.height / 2, nx: 0, ny: -sign },
  ];
}
function span(a: Port, b: Port, startGap: number, endGap: number, arrow = false): { shaft: string; head: string } {
  const start = { x: a.x + a.nx * startGap, y: a.y + a.ny * startGap };
  const tip = { x: b.x + b.nx * endGap, y: b.y + b.ny * endGap };
  const forward = Math.max(0, (tip.x - start.x) * a.nx + (tip.y - start.y) * a.ny);
  const headLength = arrow ? Math.min(8, forward * .4) : 0;
  const end = { x: tip.x + b.nx * headLength, y: tip.y + b.ny * headLength };
  // Reserve straight, tangent-aligned joins at the necks and before the arrowhead.
  // The shaft stops at the head's base: a curved shaft cannot poke out of its sides.
  const join = Math.min(4, (forward - headLength) * .15);
  const first = { x: start.x + a.nx * join, y: start.y + a.ny * join };
  const last = { x: end.x + b.nx * join, y: end.y + b.ny * join };
  const handle = Math.min(90, Math.max(0, forward - headLength - 2 * join) * .45);
  const halfWidth = headLength * .42;
  return {
    shaft: `M${start.x},${start.y} L${first.x},${first.y} C${first.x + a.nx * handle},${first.y + a.ny * handle} ${last.x + b.nx * handle},${last.y + b.ny * handle} ${last.x},${last.y} L${end.x},${end.y}`,
    head: arrow ? `M${tip.x},${tip.y} L${end.x - b.ny * halfWidth},${end.y + b.nx * halfWidth} L${end.x + b.ny * halfWidth},${end.y - b.nx * halfWidth} Z` : '',
  };
}

const neckLength = 10;

// A single outline, including the two small necks: no rectangle seam across the line.
function labelOutline(box: Box, ports: Port[]): string {
  const w = box.width / 2, h = box.height / 2, radius = 8;
  const sides = [
    { x: -w, y: -h, tx: 1, ty: 0, nx: 0, ny: -1, length: box.width },
    { x: w, y: -h, tx: 0, ty: 1, nx: 1, ny: 0, length: box.height },
    { x: w, y: h, tx: -1, ty: 0, nx: 0, ny: 1, length: box.width },
    { x: -w, y: h, tx: 0, ty: -1, nx: -1, ny: 0, length: box.height },
  ];
  let d = `M${-w + radius},${-h}`;
  for (let i = 0; i < sides.length; i++) {
    const side = sides[i]!;
    const at = (t: number, outward = 0) => `${side.x + side.tx * t + side.nx * outward},${side.y + side.ty * t + side.ny * outward}`;
    const positions = ports.filter(p => p.nx === side.nx && p.ny === side.ny)
      .map(p => (p.x - box.x - side.x) * side.tx + (p.y - box.y - side.y) * side.ty).sort((a, b) => a - b);
    for (const t of positions) {
      d += ` L${at(t - 6)} C${at(t - 2)},${at(t - .4, neckLength - 4)},${at(t - .4, neckLength)}`;
      d += ` L${at(t + .4, neckLength)} C${at(t + .4, neckLength - 4)},${at(t + 2)},${at(t + 6)}`;
    }
    const next = sides[(i + 1) % sides.length]!;
    d += ` L${at(side.length - radius)} Q${at(side.length)} ${next.x + next.tx * radius},${next.y + next.ty * radius}`;
  }
  return d + ' Z';
}

function edgePorts(source: Box, target: Box, label: Box, loop: boolean) {
  const [departure, entry] = facingPorts(source, label, 20, 14, loop ? -.65 : 0);
  const [exit, arrival] = facingPorts(label, target, 14, 20, loop ? .65 : 0);
  if (entry.nx === exit.nx && entry.ny === exit.ny) {
    const axis = entry.nx !== 0 ? 'y' : 'x';
    const half = (axis === 'y' ? label.height : label.width) / 2 - 14;
    if (Math.abs(entry[axis] - exit[axis]) < 16) {
      const middle = clamp((entry[axis] + exit[axis]) / 2, label[axis] - half + 8, label[axis] + half - 8);
      const sign = entry[axis] <= exit[axis] ? 1 : -1;
      entry[axis] = middle - sign * 8;
      exit[axis] = middle + sign * 8;
    }
    // Align the other ends where their flat sides allow it, including self-loops.
    departure[axis] = clamp(entry[axis], source[axis] - (axis === 'y' ? source.height : source.width) / 2 + 20, source[axis] + (axis === 'y' ? source.height : source.width) / 2 - 20);
    arrival[axis] = clamp(exit[axis], target[axis] - (axis === 'y' ? target.height : target.width) / 2 + 20, target[axis] + (axis === 'y' ? target.height : target.width) / 2 - 20);
  }
  if (loop) {
    const axis = departure.nx !== 0 ? 'y' : 'x';
    const half = (axis === 'y' ? source.height : source.width) / 2 - 20;
    const spread = Math.min(10, half);
    const middle = clamp((departure[axis] + arrival[axis]) / 2, source[axis] - half + spread, source[axis] + half - spread);
    const sign = entry[axis] <= exit[axis] ? 1 : -1;
    departure[axis] = middle - sign * spread;
    arrival[axis] = middle + sign * spread;
  }
  return { departure, entry, exit, arrival };
}

function renderRoute({ departure, entry, exit, arrival }: ReturnType<typeof edgePorts>, label: Box) {
  const incoming = span(departure, entry, 1.5, neckLength);
  const outgoing = span(exit, arrival, neckLength, 2.5, true);
  return {
    before: incoming.shaft,
    after: outgoing.shaft,
    arrow: outgoing.head,
    surface: labelOutline(label, [entry, exit]),
  };
}

/** Demo renderer geometry, not a general obstacle router. */
export function edgeRoute(source: Box, target: Box, label: Box, loop: boolean) {
  return renderRoute(edgePorts(source, target, label, loop), label);
}

type Attachment = { id: string; port: Port; opposite: Port };

// Separate all incoming AND outgoing attachments on each flat side. The ordered
// least-squares projection moves crowded ports together, avoiding an arbitrary bias
// towards either end of the side. Stable geometric ordering prevents local crossings.
function spreadPorts(box: Box, attachments: Attachment[]) {
  if (attachments.length < 2) return;
  const axis = attachments[0]!.port.nx ? 'y' : 'x';
  const half = Math.max(0, (axis === 'x' ? box.width : box.height) / 2 - 20);
  const low = box[axis] - half, high = box[axis] + half;
  attachments.sort((a, b) => a.opposite[axis] - b.opposite[axis] || a.port[axis] - b.port[axis] || a.id.localeCompare(b.id));
  const gap = Math.min(16, (high - low) / (attachments.length - 1));
  const upper = high - gap * (attachments.length - 1);
  const blocks: { start: number; count: number; sum: number }[] = [];
  for (const [i, attachment] of attachments.entries()) {
    blocks.push({ start: i, count: 1, sum: attachment.port[axis] - i * gap });
    while (blocks.length > 1) {
      const right = blocks[blocks.length - 1]!, left = blocks[blocks.length - 2]!;
      if (left.sum / left.count <= right.sum / right.count) break;
      blocks.pop(); left.sum += right.sum; left.count += right.count;
    }
  }
  for (const block of blocks) {
    const value = clamp(block.sum / block.count, low, upper);
    for (let i = block.start; i < block.start + block.count; i++) attachments[i]!.port[axis] = value + i * gap;
  }
}

/** Plan a frame together so independent edges cannot claim the same node port. */
export function routeEdges(nodes: readonly PositionedNode[], edges: readonly PositionedEdge[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const sides = new Map<string, { box: Box; attachments: Attachment[] }>();
  function attach(nodeId: string, id: string, port: Port, opposite: Port) {
    const key = JSON.stringify([nodeId, port.nx, port.ny]);
    let side = sides.get(key);
    if (!side) { side = { box: byId.get(nodeId)!, attachments: [] }; sides.set(key, side); }
    side.attachments.push({ id, port, opposite });
  }
  const plans = edges.map(edge => {
    const source = byId.get(edge.source)!, target = byId.get(edge.target)!;
    const label = { ...(edge.labelPosition || { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }), ...(edge.label || { width: 44, height: 44 }) };
    const ports = edgePorts(source, target, label, edge.source === edge.target);
    attach(edge.source, `${edge.id}:source`, ports.departure, ports.entry);
    attach(edge.target, `${edge.id}:target`, ports.arrival, ports.exit);
    return { id: edge.id, label, ports };
  });
  for (const side of sides.values()) spreadPorts(side.box, side.attachments);
  return new Map(plans.map(plan => [plan.id, renderRoute(plan.ports, plan.label)]));
}

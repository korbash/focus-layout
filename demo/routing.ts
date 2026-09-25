import type { Point, Size } from '../src/types';

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
function span(a: Port, b: Port, startGap: number, endGap: number): string {
  const start = { x: a.x + a.nx * startGap, y: a.y + a.ny * startGap };
  const end = { x: b.x + b.nx * endGap, y: b.y + b.ny * endGap };
  // Control points stay ordered along the separating axis. No minimum handle length:
  // a tiny gap must never produce a backwards hook or an overshooting S-curve.
  const forward = (end.x - start.x) * a.nx + (end.y - start.y) * a.ny;
  const handle = Math.min(90, Math.max(0, forward) * .45);
  return `M${start.x},${start.y} C${start.x + a.nx * handle},${start.y + a.ny * handle} ${end.x + b.nx * handle},${end.y + b.ny * handle} ${end.x},${end.y}`;
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

/** Demo renderer geometry, not a general obstacle router. */
export function edgeRoute(source: Box, target: Box, label: Box, loop: boolean): { before: string; after: string; surface: string } {
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
  return {
    before: span(departure, entry, 1.5, neckLength),
    after: span(exit, arrival, neckLength, 2.5),
    surface: labelOutline(label, [entry, exit]),
  };
}

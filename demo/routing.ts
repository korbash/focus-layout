import type { Point, Size } from '../src/types';

type Box = Point & Size;
type Port = Point & { nx: number; ny: number };

// Ports stay on the straight part of a rounded rectangle, never on its corner.
function port(box: Box, toward: Point, offset = 0): Port {
  const dx = toward.x - box.x, dy = toward.y - box.y;
  if (Math.abs(dx) / box.width >= Math.abs(dy) / box.height) {
    const sign = dx < 0 ? -1 : 1;
    return { x: box.x + sign * box.width / 2, y: box.y + offset * Math.max(0, box.height / 2 - 20), nx: sign, ny: 0 };
  }
  const sign = dy < 0 ? -1 : 1;
  return { x: box.x + offset * Math.max(0, box.width / 2 - 20), y: box.y + sign * box.height / 2, nx: 0, ny: sign };
}
function span(a: Port, b: Port, startGap: number, endGap: number): string {
  const start = { x: a.x + a.nx * startGap, y: a.y + a.ny * startGap };
  const end = { x: b.x + b.nx * endGap, y: b.y + b.ny * endGap };
  const handle = Math.max(18, Math.min(90, Math.hypot(end.x - start.x, end.y - start.y) * .4));
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
  let entry = port(label, source), exit = port(label, target);
  if (entry.nx === exit.nx && entry.ny === exit.ny) {
    // Keep both necks distinct even when both ends are on the same side (including loops).
    const verticalSide = entry.nx !== 0;
    const offset = Math.min(24, (verticalSide ? label.height : label.width) / 2 - 14);
    entry = { ...entry, x: entry.x - (verticalSide ? 0 : offset), y: entry.y - (verticalSide ? offset : 0) };
    exit = { ...exit, x: exit.x + (verticalSide ? 0 : offset), y: exit.y + (verticalSide ? offset : 0) };
  }
  return {
    before: span(port(source, label, loop ? -.7 : 0), entry, 1.5, neckLength),
    after: span(exit, port(target, label, loop ? .7 : 0), neckLength, 2.5),
    surface: labelOutline(label, [entry, exit]),
  };
}

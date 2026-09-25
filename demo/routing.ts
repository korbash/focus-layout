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

/** Demo renderer geometry, not a general obstacle router. The target tip has a 9px clearance. */
export function edgeRoute(source: Box, target: Box, label: Box, loop: boolean): { before: string; after: string } {
  return {
    before: span(port(source, label, loop ? -.7 : 0), port(label, source, loop ? -.7 : 0), 3, 2),
    after: span(port(label, target, loop ? .7 : 0), port(target, label, loop ? .7 : 0), 2, 9),
  };
}

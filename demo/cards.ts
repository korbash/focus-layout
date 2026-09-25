import type { Size } from '../src/types';

export interface Card extends Size { content: SVGGElement }
const ns = 'http://www.w3.org/2000/svg';

/** Measure the same SVG text and CSS used by the renderer, after fonts are ready. */
export function measureCard(svg: SVGSVGElement, kind: 'node' | 'edge-label', title: string, subtitle: string, color?: string, detail?: string): Card {
  const probe = document.createElementNS(ns, 'g');
  probe.setAttribute('class', kind);
  probe.setAttribute('visibility', 'hidden');
  const content = document.createElementNS(ns, 'g');
  content.setAttribute('class', 'card-content');
  probe.append(content); svg.append(probe);
  function line(value: string, className: string, x: number, y: number, centered = false) {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', className); text.setAttribute('x', String(x)); text.setAttribute('y', String(y));
    if (centered) text.setAttribute('text-anchor', 'middle');
    text.textContent = value; content.append(text);
    return text;
  }
  function wrapped(value: string, className: string, x: number, y: number, width: number, leading: number, centered = false) {
    let current = line('', className, x, y, centered), words = '';
    for (const word of value.split(/\s+/)) {
      const candidate = words ? `${words} ${word}` : word;
      current.textContent = candidate;
      if (words && current.getComputedTextLength() > width) {
        current.textContent = words;
        y += leading; current = line(word, className, x, y, centered); words = word;
      } else words = candidate;
    }
    return y;
  }
  if (kind === 'node') {
    line(subtitle, 'node-category', 0, 0, true);
    wrapped(title, 'node-name', 0, 22, 150, 19, true);
  } else {
    const bottom = wrapped(title, 'edge-name', 10, 0, 146, 15);
    const signatureBottom = wrapped(subtitle, 'edge-type', 0, bottom + 14, 156, 12);
    if (detail) wrapped(detail, 'edge-description', 0, signatureBottom + 18, 156, 14);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'dot'); dot.setAttribute('cx', '0'); dot.setAttribute('cy', '-4');
    dot.setAttribute('r', '3'); dot.setAttribute('fill', color!); content.append(dot);
  }
  const bounds = content.getBBox();
  const width = Math.ceil(bounds.width + (kind === 'node' ? 40 : 28));
  const height = Math.max(44, Math.ceil(bounds.height + 26));
  content.setAttribute('transform', `translate(${-bounds.x - bounds.width / 2},${-bounds.y - bounds.height / 2})`);
  probe.remove();
  return { width, height, content };
}

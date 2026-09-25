/** All coordinates are world-space centres. The host owns pixels, DOM and events. */
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface GraphNode extends Size { id: string }
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Measured by the host. Reserves space; the library never interprets label text. */
  label?: Size;
}
export interface Graph { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }
export interface FocusOptions {
  depth?: number;
  direction?: 'in' | 'out' | 'both';
  /** Limits solver work without silently pretending that the whole neighbourhood is visible. */
  maxNodes?: number;
  /** A display filter only; no changes to the original graph. */
  edgeIds?: readonly string[];
}
export interface LayoutOptions extends FocusOptions {
  flow?: 'horizontal' | 'vertical' | 'free';
  gap?: number;
  linkDistance?: number;
}
export interface Selection extends Graph { focus: string; omitted: number }
export interface PositionedNode extends GraphNode, Point { opacity: number }
export interface PositionedEdge extends GraphEdge {
  opacity: number;
  labelPosition?: Point;
}
export interface Frame {
  focus: string;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  omitted: number;
}
export interface EngineRequest {
  graph: Graph;
  focus: string;
  previous?: Frame;
  options?: LayoutOptions;
}
/** Replaceable: can run in a worker. The signal is advisory; stale results are always ignored. */
export type LayoutEngine = (request: EngineRequest, signal: AbortSignal) => Frame | Promise<Frame>;
export interface Clock {
  now(): number;
  request(callback: (timestamp: number) => void): unknown;
  cancel(handle: unknown): void;
}
export interface ExplorerOptions {
  layout?: LayoutOptions;
  duration?: number;
  engine?: LayoutEngine;
  clock?: Clock;
  onFrame(frame: Frame): void;
}
export type TransitionResult = { status: 'finished' | 'cancelled'; frame: Frame };

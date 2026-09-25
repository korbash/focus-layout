import { validateGraph } from './graph.js';
import { layoutFocus } from './layout.js';
import { transitionFrame } from './transition.js';
import type { Clock, ExplorerOptions, Frame, Graph, LayoutOptions, TransitionResult } from './types.js';

const browserClock: Clock = {
  now: () => performance.now(),
  request: fn => requestAnimationFrame(fn),
  cancel: id => cancelAnimationFrame(id as number),
};

function sameLayout(a: LayoutOptions, b: LayoutOptions): boolean {
  const defaults = { depth: 2, direction: 'out', maxNodes: 60, gap: 28, linkDistance: 180, flow: 'free' } as const;
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const av = a[key] === undefined ? defaults[key] : a[key];
    const bv = b[key] === undefined ? defaults[key] : b[key];
    if (av !== bv) return false;
  }
  if (a.edgeIds === undefined || b.edgeIds === undefined) return a.edgeIds === b.edgeIds;
  const left = new Set(a.edgeIds), right = new Set(b.edgeIds);
  return left.size === right.size && [...left].every(id => right.has(id));
}

/** No event listeners or renderer: the host calls focus() from any interaction. */
export function createExplorer(input: Graph, config: ExplorerOptions) {
  validateGraph(input);
  let graph = structuredClone(input);
  let settings = structuredClone(config.layout || {});
  let current: Frame = { focus: '', nodes: [], edges: [], omitted: 0 };
  const clock = config.clock || browserClock;
  const engine = config.engine || layoutFocus;
  let destroyed = false, generation = 0;
  let completed: { id: string; layout: LayoutOptions } | undefined;
  let active: { id: string; layout: LayoutOptions; promise?: Promise<TransitionResult>; abort: AbortController; handle?: unknown; resolve(result: TransitionResult): void; reject(error: unknown): void } | undefined;
  const snapshot = () => structuredClone(current);
  function cancel() {
    generation++;
    completed = undefined;
    if (active) {
      const old = active; active = undefined;
      old.abort.abort();
      if (old.handle !== undefined) clock.cancel(old.handle);
      old.resolve({ status: 'cancelled', frame: snapshot() });
    }
  }
  function assertAlive() { if (destroyed) throw new Error('Explorer is destroyed'); }
  function focus(id: string, options: LayoutOptions & { duration?: number } = {}): Promise<TransitionResult> {
    assertAlive();
    if (!graph.nodes.some(n => n.id === id)) return Promise.reject(new Error(`Unknown focus: ${id}`));
    const duration = options.duration ?? config.duration ?? 450;
    if (!Number.isFinite(duration) || duration < 0) return Promise.reject(new Error('duration must be finite and nonnegative'));
    const { duration: _, ...layout } = options;
    const nextSettings = structuredClone({ ...settings, ...layout });
    // Repeated clicks must not relax the solver again or restart an in-flight transition.
    if (active?.id === id && active.promise && sameLayout(active.layout, nextSettings)) {
      return active.promise.then(result => structuredClone(result));
    }
    if (!active && completed?.id === id && sameLayout(completed.layout, nextSettings)) {
      return Promise.resolve({ status: 'finished', frame: snapshot() });
    }
    cancel();
    const version = generation;
    settings = nextSettings;
    const from = snapshot(), abort = new AbortController();
    const operation = new Promise<TransitionResult>((resolve, reject) => {
      active = { id, layout: nextSettings, abort, resolve, reject };
      const fail = (error: unknown) => {
        if (version !== generation || destroyed) return;
        if (active?.handle !== undefined) clock.cancel(active.handle);
        active = undefined; reject(error);
      };
      const publish = (frame: Frame) => {
        current = frame;
        config.onFrame(snapshot());
      };
      // Promise boundary catches synchronous solver errors and permits a worker-backed engine.
      Promise.resolve().then(() => {
        if (abort.signal.aborted) return undefined;
        return engine({ graph: structuredClone(graph), focus: id, previous: from, options: structuredClone(nextSettings) }, abort.signal);
      }).then(to => {
        if (!to || version !== generation || destroyed) return;
        if (duration === 0) {
          publish(to);
          if (version !== generation || destroyed) return;
          completed = { id, layout: nextSettings };
          active = undefined; resolve({ status: 'finished', frame: snapshot() }); return;
        }
        const start = clock.now();
        const tick = (now: number) => {
          if (version !== generation || destroyed) return;
          try {
            const progress = Math.max(0, Math.min(1, (now - start) / duration));
            publish(transitionFrame(from, to, progress));
            if (version !== generation || destroyed) return;
            if (progress === 1) { completed = { id, layout: nextSettings }; active = undefined; resolve({ status: 'finished', frame: snapshot() }); }
            else if (active) active.handle = clock.request(tick);
          } catch (error) { fail(error); }
        };
        if (active) active.handle = clock.request(tick);
      }).catch(fail);
    });
    active!.promise = operation;
    return operation.then(result => structuredClone(result));
  }
  return {
    focus,
    snapshot,
    cancel,
    /** Does not infer a focus or animate; call focus() explicitly after replacing data. */
    setGraph(next: Graph) { assertAlive(); validateGraph(next); cancel(); graph = structuredClone(next); },
    destroy() { cancel(); destroyed = true; },
  };
}

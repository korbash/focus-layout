import { validateGraph } from './graph.js';
import { layoutFocus } from './layout.js';
import { transitionFrame } from './transition.js';
import type { Clock, ExplorerOptions, Frame, Graph, LayoutOptions, TransitionResult } from './types.js';

const browserClock: Clock = {
  now: () => performance.now(),
  request: fn => requestAnimationFrame(fn),
  cancel: id => cancelAnimationFrame(id as number),
};

/** No event listeners or renderer: the host calls focus() from any interaction. */
export function createExplorer(input: Graph, config: ExplorerOptions) {
  validateGraph(input);
  let graph = structuredClone(input);
  let settings = { ...config.layout };
  let current: Frame = { focus: '', nodes: [], edges: [], omitted: 0 };
  const clock = config.clock || browserClock;
  const engine = config.engine || layoutFocus;
  let destroyed = false, generation = 0;
  let active: { abort: AbortController; handle?: unknown; resolve(result: TransitionResult): void; reject(error: unknown): void } | undefined;
  const snapshot = () => structuredClone(current);
  function cancel() {
    generation++;
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
    cancel();
    const version = generation;
    const { duration: _, ...layout } = options;
    settings = { ...settings, ...layout };
    const from = snapshot(), abort = new AbortController();
    return new Promise((resolve, reject) => {
      active = { abort, resolve, reject };
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
        return engine({ graph: structuredClone(graph), focus: id, previous: from, options: { ...settings } }, abort.signal);
      }).then(to => {
        if (!to || version !== generation || destroyed) return;
        if (duration === 0) {
          publish(to);
          if (version !== generation || destroyed) return;
          active = undefined; resolve({ status: 'finished', frame: snapshot() }); return;
        }
        const start = clock.now();
        const tick = (now: number) => {
          if (version !== generation || destroyed) return;
          try {
            const progress = Math.max(0, Math.min(1, (now - start) / duration));
            publish(transitionFrame(from, to, progress));
            if (version !== generation || destroyed) return;
            if (progress === 1) { active = undefined; resolve({ status: 'finished', frame: snapshot() }); }
            else if (active) active.handle = clock.request(tick);
          } catch (error) { fail(error); }
        };
        if (active) active.handle = clock.request(tick);
      }).catch(fail);
    });
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

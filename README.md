# Focus Layout

A renderer-independent graph explorer powered by [WebCola](https://github.com/tgdwyer/WebCola).
Choose a node, reveal its neighbourhood, and transition from the current arrangement to the next.

The package returns **geometry, not UI**. It doesn't register clicks, create DOM elements, interpret labels,
or know anything about Angular, React, databases, or domain models. The included playground implements
those decisions as a separate consumer.

## Run the playground

```sh
npm ci
npm run dev
# http://127.0.0.1:4322
```

Click nodes to refocus, inspect connections, follow incoming/outgoing links, change depth, filter files,
and go back. The synthetic example includes cycles, self-loops, and two different edges with the same
endpoints. No external accounts, fonts, services, or data are required.

## Use the library

The package is not published to npm yet. Build and `npm pack` this repository, then install the generated
archive in your application. `dist/` includes ESM JavaScript, declarations, and source maps.

```ts
import { createExplorer } from '@korbash/focus-layout';

const explorer = createExplorer({
  nodes: [
    { id: 'document', width: 140, height: 64 },
    { id: 'person', width: 120, height: 64 },
  ],
  edges: [
    {
      id: 'author', source: 'document', target: 'person',
      label: { width: 160, height: 48 },
    },
  ],
}, {
  layout: { depth: 2, direction: 'out', flow: 'free' },
  duration: 450,
  onFrame(frame) {
    render(frame); // your SVG, HTML, Canvas, WebGL, or framework
  },
});

await explorer.focus('document');

// Your click/keyboard handler decides whether to focus or show an inspector.
await explorer.focus('person', { depth: 3 });

// Interrupts the current transition; its promise resolves with status 'cancelled'.
explorer.cancel();
explorer.destroy();
```

A newer `focus()` cancels the previous animation and pending layout request. It starts from the last
published frame, not the abandoned destination. Late results from an async engine are ignored.
Promises resolve to `{ status: 'finished' | 'cancelled', frame }`; solver/render errors reject.
`onFrame` receives a copy; consumers cannot accidentally mutate internal animation state.

### Coordinates and labels

All positions are **centres in world coordinates**, independent of viewport and device-pixel ratio.
The focused node finishes at `(0, 0)`. The host positions its camera at that origin or chooses its own
camera transform. The package does not resize or zoom your viewport.

The host measures node rectangles and optional edge label rectangles. A label becomes a temporary
layout box connected to its endpoints, so WebCola makes room for it. It is still an **edge label** in the
public result, never a semantic node; labels don't add hops to the neighbourhood. Read its centre from
`edge.labelPosition`. Unlabelled edges don't reserve space.

Each frame contains `nodes`, `edges`, `focus`, and `omitted`. Nodes include `x`, `y`, `width`, `height`,
and `opacity`. Edges include their original endpoints, label dimensions/position, and `opacity`.
Entering/exiting entities fade; both endpoints of every transitional edge remain in its frame.
Keep display metadata keyed by IDs in your host, including exiting entities until animation completes.

Edges are **not routed by this package**. The demo draws curved connections through separate
node and label ports, with arrowheads stopping just before the target card, including self-loops.
Labels have a continuous outline that tapers locally into the connecting lines.
Short straight joins connect the curves to the label necks and arrowheads. Arrowheads are separate
filled triangles; shafts end at their bases instead of continuing beneath them.
Facing ports are selected together from the free space between boxes; curve handles shrink with
that space so short links don't double back. This is local routing, not obstacle avoidance.
The playground measures SVG text after fonts load and passes the resulting card sizes to the solver.
Short labels shrink to their content; selected metrics include wrapped descriptions to demonstrate
different heights. The demo uses a 40-unit card gap, leaving room for the tapered label ends.
Its direction toolbar shows incoming/outgoing connection counts and can reveal incoming neighbours
when an outgoing-only view leaves the focused node isolated.
Your renderer decides ports, arrowheads, line styles, label content, hit areas, and routing.

### Independent primitives

```ts
import { selectNeighborhood, layoutFocus, transitionFrame } from '@korbash/focus-layout';

const visible = selectNeighborhood(graph, 'person', {
  depth: 2, direction: 'both', maxNodes: 60,
});

const next = layoutFocus({ graph, focus: 'person', previous: current, options: { gap: 24 } });
const halfway = transitionFrame(current, next, 0.5);
```

- `selectNeighborhood` does directed breadth-first traversal, with a visited set for cycles. It retains
  all allowed edges between reached nodes, including parallel edges and self-loops. `depth: 0` shows
  only the focus (and its allowed self-loops). Nodes nearest to focus have priority at the limit.
- `layoutFocus` seeds WebCola from previous positions and places new nodes near known neighbours.
  WebCola solves the geometry. Its input is private: the caller's graph is never mutated.
- `transitionFrame` samples a transition at progress `[0, 1]` using smoothstep; the caller owns time.
  It also accepts a partially animated frame for interruption. It doesn't run the solver.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `depth` | `2` | Semantic hops, integer 0–20 |
| `direction` | `'out'` | `'in'`, `'out'`, or `'both'` traversal |
| `maxNodes` | `60` | Visible semantic-node budget, 1–200 |
| `edgeIds` | all edges | Optional allowlist for display filtering; `[]` hides all edges |
| `flow` | `'free'` | Organic, `'horizontal'`, or `'vertical'` layout |
| `gap` | `28` | Padding between measured rectangles |
| `linkDistance` | `180` | Desired distance per solver link; labelled edges use two links |
| `duration` | `450` ms | Controller option or per-focus override; `0` disables animation |

Per-focus layout options persist for the next focus. Pass `edgeIds: undefined` to reset the allowlist.
Filters only affect display; they never modify the original graph or semantic resolution in the host.
`omitted` counts eligible nodes beyond `maxNodes`, not beyond `depth`.
The solver refuses more than 400 boxes (nodes plus labels) rather than freezing on an unbounded graph.

`setGraph(graph)` validates and replaces the graph, cancels pending work, and preserves the displayed
frame. Call `focus(id)` afterward to choose the next visible state. `snapshot()` returns a copy.

### Angular and worker integration

Run the controller outside Angular's zone if appropriate. Feed `onFrame` into your view state or SVG
renderer and call `destroy()` on component destruction. Handle accessibility, measurements, and
`prefers-reduced-motion` in the host (`duration: 0` is supported without browser globals).

The default solver is **synchronous** and intended for small local neighbourhoods. For expensive graphs,
provide an async `engine(request, signal)` which sends the plain request to your own Web Worker and calls
`layoutFocus` there. The controller rejects stale results even if your worker cannot cancel calculation.
A custom `clock` (`now`, `request`, `cancel`) supports tests, alternate frame schedulers, and non-browser use.
By default, animated playback uses `requestAnimationFrame`; static layout and transition sampling work in Node.

## What is reused, what is new?

WebCola already provides starting coordinates, fixed nodes, rectangular overlap constraints, directed
flow with cycle handling, and simulation events. We reuse its solver unchanged. The focus layer adds
neighbourhood selection, measured edge-label boxes, snapshot transitions, entry/exit, interruption,
and lifecycle management.

We also evaluated [@statelyai/graph](https://github.com/statelyai/graph), which provides a WebCola adapter
and `genLayoutTransition`. Its transition emits node positions without edge routes or entry/exit fades.
This small library connects directly to WebCola to keep focus, label geometry, and animation state in one
contract; it doesn't implement another physical solver. See [design notes](DESIGN.md).

## Current limits

This is an initial implementation, not an optimal graph drawing algorithm. Warm starting encourages
stability but does not bound node displacement. Overlap constraints apply to final solver boxes;
interpolated trajectories can temporarily cross. The solver runs a finite iteration budget, so arbitrary
inputs are not guaranteed overlap-free. There is no edge-crossing minimisation or obstacle-aware routing
contract. Simple demo curves can cross other lines or boxes. Cycle edges are preserved; directed layout
constraints are relaxed inside strongly connected components by WebCola.

## Development

```sh
npm test           # typed library + Node tests with real WebCola and an injected clock
npm run build:demo # type-check and bundle the standalone renderer
npm run test:e2e   # browser interaction test
npm run check      # all of the above
```

Browser tests use `/usr/bin/chromium`, or `CHROMIUM_PATH`. No Angular dependency.
MIT. WebCola is MIT; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

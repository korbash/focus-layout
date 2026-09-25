# Design: focus is an interaction layer above a layout solver

## Boundary

The consumer supplies a directed multigraph with stable string IDs, measured node and label rectangles,
and a focus intent. Domain facts, text, colors, click decisions, HTML, arrowheads, camera, and navigation
history belong to the consumer. The demo is deliberately just another consumer.

Pipeline:

```
graph + focus + visibility rules
          ↓
   directed neighbourhood
          ↓
   nodes + temporary label boxes + previous positions
          ↓
      WebCola solver
          ↓
   target frame (focus at origin)
          ↓
   transition from last displayed frame
          ↓
        host renderer
```

There is no database, network request, external telemetry, or framework dependency in the library.
The generic sample data is authored for this project; no application source or production data is copied.

## Existing work, checked September 25, 2026

- [WebCola `Layout`](https://github.com/tgdwyer/WebCola/blob/master/src/layout.ts) already accepts positions,
  rectangle sizes, fixed flags, constraints, and `flowLayout`; start/tick/end events expose the iterative
  solver. We use bounded `start(20, 30, 80, 0, false, false)` calculations. We don't run the synchronous
  `kick()` convergence loop or make UI rendering depend on WebCola's tick timing.
- [WebCola graph exploration example](https://ialab.it.monash.edu/webcola/examples/onlinebrowse.html)
  demonstrates that incremental exploration does not need a new physical algorithm.
- [@statelyai/graph WebCola adapter](https://github.com/statelyai/graph/blob/main/src/layout/webcola.ts)
  and [layout transitions](https://github.com/statelyai/graph/blob/main/src/layout/index.ts) cover much of
  static geometry and node interpolation. They don't provide our full focus-controller/edge-label/fade
  contract. A direct adapter avoids a second graph data model and gives access to WebCola settings.
- [Kumu force-directed layout](https://docs.kumu.io/guides/layouts/force-directed) describes gravity,
  repulsion, connection forces, and pinned positions. [Kumu focus](https://docs.kumu.io/guides/focus)
  describes bounded neighbourhoods and traversal directions. These are behavioural references; this
  project does not use or claim to reproduce Kumu's private code or exact heuristics.

## Label geometry

Every measured label adds one private solver node with two links, or one link for a self-loop.
This makes label rectangles part of overlap avoidance and separates parallel labels. It changes the
solver's ideal distances but not the public graph or traversal depth. Plain edge identities survive.
Labels are laid out only when the consumer supplies dimensions. The library doesn't choose their
appearance or calculate text metrics. Label routing is deliberately left open.

## Focus and continuity

The selected node is pinned while solving, then all coordinates are translated so it finishes at the
origin. Existing centres initialise the next calculation; newly revealed nodes start near a known
adjacent node or near the focus, with deterministic angular offsets. This is a warm start, not a
formal minimal-displacement guarantee. The host may fit or pan its camera independently.

An unchanged focus request is idempotent: it reuses the current settled geometry, or joins an identical
in-flight request without restarting its timer. Only the current request is reused, not a history of
layouts. Effective layout defaults and edge allowlist membership determine equivalence. Graph
replacement, explicit cancellation, and failures invalidate reuse, avoiding solver drift on repeated clicks.

The controller has one active generation. A new intent cancels its scheduled frame and aborts any
pending async engine. Each response checks its generation before publication. A new transition starts
from the last published geometry including opacity, even if an older one was halfway done. Reentrant
callbacks are checked before scheduling another frame. The controller owns animation timing only;
the solver is replaceable and doesn't know about clocks.

## Deliberate limits and next improvements

- Current calculations are synchronous, bounded, and best suited to tens of visible nodes. Worker
  transport is an injectable engine, not a hidden global worker or application-specific RPC.
- Final boxes are checked in tests on cycles and parallel edges; hard guarantees for every graph and
  every animation frame would need an explicit feasibility/trajectory contract.
- Obstacle-aware edge routing, animated routes, ports, and crossing objectives are independent future
  modules. They must respect label boxes rather than silently drawing through them.
- No semantic graph persistence or history in core. The host can maintain multiple views/controllers.
- No Angular adapter yet: integrate this package only after the standalone interaction is accepted.

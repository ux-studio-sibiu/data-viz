# data-viz — The Carbon Divide

An interactive globe of country-level climate data, built in **Angular + Three.js + GSAP + D3**,
one lesson at a time. Like `learn-angular`: each lesson is one small, reviewable change and one commit
(you commit, Claude never does).

Unlike `learn-angular`, the lessons don't build separate demos. They all grow **one product, the globe**.
Each lesson's notes are an Angular page of their own, shown in a **floating lesson window** on top of
the running product.

---

## 1. The lesson window

### What it looks like

```
┌──────────────────────────────────────────────────────────────┐
│  The Carbon Divide           [metric ▾]  [year ──●──]  [📖 L] │  ← product (primary outlet)
│                                                              │
│              ╭──────────╮        ┌─ 08 Choropleth ─── ‹ › _ ✕┐ │
│            ╭─┤  GLOBE   ├─╮      │ ⠿ drag here              │ │
│            │ ╰──────────╯ │      │ D3 scales → a palette    │ │  ← lesson page (named outlet "lesson")
│            ╰──────────────╯      │ texture …                │ │     inside the floating window
│                                  │ [Show me: log scale]     │ │
│                                  └──────────────────────────◢┘ │
│                                                              │
│  ▭ 08 Choropleth                                             │  ← the same window when minimized
└──────────────────────────────────────────────────────────────┘
```

- **Movable**: drag the title bar. It stays inside the viewport.
- **Resizable**: drag the corner.
- **Minimizable**: collapses to a small bar docked at the bottom. Click it to restore it where it was.
- **Closable**: removes the lesson from the URL. The product keeps running.
- **Not a blocking modal**: the globe stays usable while the window is open. It is a *non-modal*
  `<dialog>`, opened with `show()`, not `showModal()`, so lesson 08's "Show me" buttons can drive
  the globe while you watch.
- Position and size are remembered between visits (`localStorage`, in try/catch). Minimized state isn't: a reload opens the window normally.
- Keyboard: `L` toggles the window, `Esc` minimizes it, arrow keys move it when the title bar has focus.

### How it's wired: a named router outlet

Lessons are real lazy-loaded routes that render in a **second, named outlet**:

```
/                                    → product only
/(lesson:lessons/choropleth)         → product + lesson 08 in the window
/lessons/choropleth                  → the same lesson page full-screen (for reading or printing)
```

- Each lesson is still its own page and its own lazy chunk. It's deep-linkable, and the back button works.
- The product route doesn't know lessons exist. Deleting the outlet line removes the whole lesson layer,
  for example if the portfolio version should ship without it. Or keep it behind `?lessons` as a
  "how this was built" feature for portfolio visitors.
- Lesson pages can `inject()` the product's stores (both share the root injector). "Show me" buttons
  can select a country, change the metric or scrub the year in the live globe.
- Angular concept: auxiliary routes ≈ Next.js **parallel routes + intercepting routes** (the "modal
  over a page, with its own URL" pattern).

### Components: generic first, lesson-specific last

Rule: the reusable pieces know nothing about lessons, routing or the globe. Only the last layer
combines them.

| Piece | Kind | Knows about | Role |
|---|---|---|---|
| `Draggable` | directive (`[nscDraggable]`, + `nscDragHandle`) | nothing | Pointer-event drag with `setPointerCapture`, clamped to the viewport. Writes a `translate` value. Outputs the position. Reusable on anything. |
| `FloatingPanel` | component (`nsc-floating-panel`) | `Draggable` | Window frame: title bar, minimize/close buttons, resize corner, open/minimized state as a signal. Content through `ng-content` slots: `[panel-title]`, `[panel-actions]`, default body. Emits `closed`. |
| `PanelDock` | component | nothing | Where minimized panels collapse to (bottom bar). Panels register themselves with it, so more than one panel could be minimized later (a "data sources" window, for example). |
| `PanelMemory` | small service | nothing | Saves and restores `{ x, y, w, h, minimized }` per panel id. |
| `LessonWindow` | component | router, `FloatingPanel` | The only lesson-specific frame: `FloatingPanel` + `<router-outlet name="lesson">` + prev/next links + the "open full page" link. Rendered once in `app.html`. |
| `LessonPage` | layout component (`nsc-lesson`) | nothing | Lesson content layout through slots: eyebrow, title, body, "Files in this lesson", "Review checklist". Every lesson page uses it. |
| `ShowMe` | small component (button) | the product stores | Runs a state change in the live product from inside a lesson ("Show me: France, 1990"). |

Content stays in markup, per `COMPONENT_PATTERNS.md`. Lesson text is written as template children,
not in data arrays. The only list is the route table, which drives prev/next and the roadmap.

---

## 2. Technical decisions

| Topic | Decision | Why |
|---|---|---|
| Angular | **21** (22 needs Node 22.22+, this machine has Node 20), standalone components, **zoneless**, SCSS, **no SSR** | Zoneless removes the `runOutsideAngular` workarounds for GSAP and Three.js. A WebGL globe gets nothing from SSR. |
| Reuse | **Copy** `useGsap`, `MotionPreference` and the Three.js lifecycle pattern in from `learn-angular`, in the lesson that first needs them | Workspace rule: shared tools are copied in, never linked out |
| D3 | Modular packages: `d3-geo`, `d3-scale`, `d3-scale-chromatic`, `d3-array`, `d3-shape` | **D3 does the math, Angular renders the DOM.** |
| Data | A Node script in `scripts/` fetches the data once and writes compact JSON to `public/data/` | No live API calls: no CORS, rate-limit or downtime problems. Units, sources and licenses are kept in the output. |
| Boundaries | Natural Earth via `world-atlas` TopoJSON (public domain), joined on ISO3 | Handles numeric IDs, the `-99` codes for France, Norway and Kosovo, and disputed areas |
| Country fills | **ID-map texture** + 256-entry palette texture in a shader. Real meshes only for extrusion (lesson 15). | Picking is one texture read, which works for microstates. Changing metric or year only updates the palette, so GSAP can tween between two palettes. |
| State | Signal stores (selection, metric, year, pinned countries), synced to query params | Every view of the globe is a shareable link |
| Story | **The Carbon Divide**: OWID CO₂, then ND-GAIN vulnerability | Clear visual language. The data layer stays generic, so other datasets can be added. |

---

## 3. Lessons

Each lesson = one commit + one lesson page. In the table, the "Product change" column is what the
product gains, and "Concepts" is what the lesson page explains.

| # | Lesson | Product change | Concepts |
|---|---|---|---|
| 00 | Setup | App shell, explorer placeholder, lazy lessons area, roadmap | `ng new`, `app.config`, zoneless, style-guide conventions |
| 01 | The lesson window | `Draggable`, `FloatingPanel`, `PanelDock`, `PanelMemory`, `LessonWindow`, `LessonPage` | Named outlets, attribute directives, `ng-content` slots, non-modal `<dialog>`, pointer events, `host` bindings |
| 02 | Data pipeline I: boundaries | `scripts/build-boundaries`, `public/data/countries.*` | TopoJSON → GeoJSON, ISO3 lookup, country metadata, safe island removal, simplification + smoothing without gaps |
| 03 | Flat map first (SVG) | 2D map with hover tooltip, later the no-WebGL fallback | `d3-geo` projection + Angular SVG templates |
| 04 | The globe | Three.js sphere, OrbitControls, atmosphere | Three.js lifecycle in Angular, render on demand, dispose |
| 05 | Countries on the sphere | Borders + ID-map texture | lon/lat → xyz, a scanline-filled ID map (canvas anti-aliasing would corrupt the ids), `LineSegments` |
| 06 | Picking | Hover highlight, click to select, shared selection with the map | Ray vs. a maths sphere → lon/lat → ID map pixel, shader uniforms, click vs. drag |
| 07 | Stores and the URL | Selection store, country search list | Signal stores, query-param sync, keyboard access, microstates |
| 08 | Data pipeline II: CO₂ | OWID CO₂ → 7 per-metric files + meta; CO₂ figures in the selection card; Western Sahara revisited (kept de facto: OWID has no data for it) | Typed models, `httpResource` with `parse`, missing values with years |
| 09 | Choropleth and legend | Globe and map coloured by a metric (?metric=), legend with a metric switcher, hatched no-data | `d3-scale` threshold + quantile breaks, 256×1 palette texture, legend slot |
| 10 | Fly to a country ✓ (done after 07) | Camera flight to the selected country, framed at 30% of the screen; the panel reveal moves to 11 | GSAP driving a slerp + climb, camera ownership, reduced motion |
| 11 | Country detail panel | Historical chart, per-capita vs total, income-group median and rank; the panel reveal | D3 line chart in an Angular SVG template |
| 12 | Time | Year slider + play, fixed class breaks, panel follows the year | GSAP palette transitions, when interpolating between years is honest |
| 13 | Linked scatter plot | GDP × CO₂ per capita, size by population | Linked selection between two views |
| 14 | Compare countries | Pin up to 3, sparklines | Normalized vs raw units |
| 15 | ⭐ Extrusion mode | Countries rise by total emissions | earcut, subdivision, antimeridian crossings, GSAP grow animation |
| 16 | The "divide" view | Bivariate responsibility × vulnerability map | 3×3 bivariate palette, second dataset |
| 17 | Scroll-driven story | Editorial intro | ScrollTrigger → store → globe |
| 18 | Polish | Loading states, touch, a11y, table fallback | `@defer`, `aria-live`, performance |
| 19 | Ship it | Static build, methodology page (incl. border choices; credit CARTOColors BrwnYl, CC BY 3.0, and Hero Patterns Graph Paper, CC BY 4.0), case study | Attribution, licenses, deploy |

Optional after 19: flow arcs between countries, if a good bilateral dataset turns up (trade, migration).

---

## 4. Lesson workflow

1. You ask for lesson N.
2. Claude implements only that lesson: the product change + its lesson page + its route + a roadmap tick.
3. The lesson page ends with **"Files in this lesson"** and a **"Review checklist"**.
4. You review, ask questions or request changes, then commit it as `lesson N`.

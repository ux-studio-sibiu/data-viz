import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import { extent, max } from 'd3-array';
import { scaleLog, scaleSqrt } from 'd3-scale';

// One dot: two values on log axes, a size value (area ∝ size), and its colour
export type ScatterPoint = { id: string; label: string; x: number; y: number; size: number; color: string };

// top: the y arrowhead; right: the x arrowhead; bottom: the tick row; left: the tick labels (the axis labels are inside)
const M = { top: 16, right: 22, bottom: 26, left: 48 }; // left: "0.001" at 12px mono is ~36px wide
// The biggest dot's radius: a share of the plot's shorter side, so dots grow with the screen (about 75px on a full HD
// stage, where a fixed 20 looked tiny, 37 still small, and 110 a pile-up), held between a floor for small windows and a ceiling for very large ones.
const MAX_RADIUS = { share: 0.09, min: 28, max: 88 };
const MIN_RADIUS = 2.5; // the smallest countries stay big enough to see and to hover

// A bubble chart on two log axes (lesson 13). Generic: points in, hover and selection out; it knows nothing about CO₂.
//   <app-scatter-plot [points]="points" xLabel="…" yLabel="…" [(hovered)]="state.hovered" [selected]="id" (pick)="select($event)" />
// Like the line chart, D3 only computes (scales, ticks); Angular draws. The plot fills its box and follows its size
// (a ResizeObserver), because the panel it lives in can be resized.
@Component({
  selector: 'app-scatter-plot',
  templateUrl: './scatter-plot.html',
  styleUrl: './scatter-plot.scss'
})
export class ScatterPlot {
  readonly points = input.required<ScatterPoint[]>();
  readonly title = input('');  // drawn in the plot's bottom-left corner
  readonly xLabel = input('');
  readonly yLabel = input('');
  readonly xPrefix = input(''); // e.g. "$" before the x tick labels
  readonly label = input('');   // what the chart shows, for screen readers
  // Fixed ranges, when the points change over time (a year slider): the axes and the dot sizes then hold still and the dots
  // move against them. Without them, each set of points is fitted on its own, and the grid would slide under a playing chart.
  readonly xDomain = input<[number, number] | null>(null);
  readonly yDomain = input<[number, number] | null>(null);
  readonly sizeMax = input<number | null>(null);
  readonly hovered = model<string | null>(null); // two-way: shared with the map and the globe through the explorer's store
  readonly selected = input<string | null>(null);
  readonly pick = output<string>();

  protected readonly M = M;
  protected readonly box = signal({ w: 400, h: 300 });

  // The tooltip: content from the parent through [scatter-tooltip], shown while the pointer is on a dot, moved with the
  // pointer by writing style.translate directly (no signal per mouse move), like the globe's (lesson 06).
  protected readonly pointerOnDot = signal(false);
  private readonly tooltip = viewChild.required<ElementRef<HTMLElement>>('tooltip');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const host = this.host, destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const { inlineSize: w, blockSize: h } = entry.contentBoxSize[0];
        if (w > 0 && h > 0) this.box.set({ w: Math.round(w), h: Math.round(h) });
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  // Log axes: GDP runs from ~$700 to ~$120 000 per person, CO₂ from 0.03 t to 40 t. On linear axes nearly every country
  // would crowd into the bottom-left corner. On log axes equal distances are equal ratios: twice as rich is always the same step.
  private readonly x = computed(() => {
    const [lo, hi] = this.xDomain() ?? extent(this.points(), p => p.x);
    return scaleLog().domain(pad(lo, hi)).range([M.left, this.box().w - M.right]);
  });
  private readonly y = computed(() => {
    const [lo, hi] = this.yDomain() ?? extent(this.points(), p => p.y);
    return scaleLog().domain(pad(lo, hi)).range([this.box().h - M.bottom, M.top]);
  });
  // Area, not radius, ∝ size: a country with 4× the people gets a dot 2× as wide. A radius scale would make it look 4× bigger.
  private readonly r = computed(() => {
    const { w, h } = this.box(), plot = Math.min(w - M.left - M.right, h - M.top - M.bottom);
    const biggest = Math.min(MAX_RADIUS.max, Math.max(MAX_RADIUS.min, plot * MAX_RADIUS.share));
    return scaleSqrt().domain([0, this.sizeMax() ?? max(this.points(), p => p.size) ?? 1]).range([0, biggest]);
  });

  // Ticks at powers of 10 only: on a log axis the in-between ones (2, 3, 4…) bunch up and their labels collide
  protected readonly xTicks = computed(() => powersOf10(this.x().domain()).map(v => ({ v, at: this.x()(v), label: this.xPrefix() + si(v) })));
  protected readonly yTicks = computed(() => powersOf10(this.y().domain()).map(v => ({ v, at: this.y()(v), label: si(v) })));

  // Biggest first, so small countries are drawn on top and stay hoverable
  protected readonly dots = computed(() => {
    const x = this.x(), y = this.y(), r = this.r();
    return this.points()
      .map(p => ({ ...p, cx: x(p.x), cy: y(p.y), r: Math.max(MIN_RADIUS, r(p.size)) }))
      .sort((a, b) => b.r - a.r);
  });
  // The selected dot again, on top of everything, hatched like the selection on the map, with its name.
  // (Hover only darkens a dot in place: see .is-hovered in the stylesheet.)
  protected readonly marked = computed(() => {
    const id = this.selected();
    const right = this.box().w - M.right;
    return this.dots().filter(d => d.id === id).map(d => {
      // The name goes right of the dot, or left of it when it would run past the edge (~7 px per character at 12 px bold)
      const flip = d.cx + d.r + 6 + d.label.length * 7 > right;
      return { ...d, labelX: flip ? d.cx - d.r - 6 : d.cx + d.r + 6, anchor: flip ? 'end' : 'start' };
    });
  });

  protected enter(id: string) { this.hovered.set(id); this.pointerOnDot.set(true); }
  protected leave() { this.hovered.set(null); this.pointerOnDot.set(false); }

  // Below-right of the pointer; flipped to the left near the right edge and above it near the bottom, so it stays inside
  protected follow(e: PointerEvent) {
    const tip = this.tooltip().nativeElement, box = this.host.getBoundingClientRect();
    let x = e.clientX - box.left + 16, y = e.clientY - box.top + 16;
    if (x + tip.offsetWidth > box.width) x -= tip.offsetWidth + 32;
    if (y + tip.offsetHeight > box.height) y -= tip.offsetHeight + 32;
    tip.style.translate = `${x}px ${y}px`;
  }
}

// The data's range plus a 25% margin on each side (a ratio, on log axes), so the biggest dots at the edges stay inside.
// Not .nice(): on log axes it rounds out to whole powers of 10, which here left half the plot empty.
function pad(lo: number | undefined, hi: number | undefined): [number, number] {
  return [(lo ?? 1) / 1.25, (hi ?? 10) * 1.25];
}

function powersOf10([lo, hi]: number[]) {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) out.push(10 ** e);
  return out;
}

// 0.1 · 1 · 10 · 1k · 10k · 100k · 1M
function si(v: number) { return v >= 1e6 ? `${v / 1e6}M` : v >= 1000 ? `${v / 1000}k` : String(v); }

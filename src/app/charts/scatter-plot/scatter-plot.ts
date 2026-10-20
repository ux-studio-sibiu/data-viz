import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, model, output, signal } from '@angular/core';
import { extent, max } from 'd3-array';
import { scaleLog, scaleSqrt } from 'd3-scale';

// One dot: two values on log axes, a size value (area ∝ size), and its colour
export type ScatterPoint = { id: string; label: string; x: number; y: number; size: number; color: string };

const M = { top: 24, right: 14, bottom: 36, left: 42 }; // top: room for the y axis label above the plot
const MAX_RADIUS = 20;

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
  readonly xLabel = input('');
  readonly yLabel = input('');
  readonly xPrefix = input(''); // e.g. "$" before the x tick labels
  readonly label = input('');   // what the chart shows, for screen readers
  readonly hovered = model<string | null>(null); // two-way: shared with the map and the globe through the explorer's store
  readonly selected = input<string | null>(null);
  readonly pick = output<string>();

  protected readonly M = M;
  protected readonly box = signal({ w: 400, h: 300 });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement, destroyRef = inject(DestroyRef);
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
    const [lo, hi] = extent(this.points(), p => p.x);
    return scaleLog().domain(pad(lo, hi)).range([M.left, this.box().w - M.right]);
  });
  private readonly y = computed(() => {
    const [lo, hi] = extent(this.points(), p => p.y);
    return scaleLog().domain(pad(lo, hi)).range([this.box().h - M.bottom, M.top]);
  });
  // Area, not radius, ∝ size: a country with 4× the people gets a dot 2× as wide. A radius scale would make it look 4× bigger.
  private readonly r = computed(() => scaleSqrt().domain([0, max(this.points(), p => p.size) ?? 1]).range([0, MAX_RADIUS]));

  // Ticks at powers of 10 only: on a log axis the in-between ones (2, 3, 4…) bunch up and their labels collide
  protected readonly xTicks = computed(() => powersOf10(this.x().domain()).map(v => ({ v, at: this.x()(v), label: this.xPrefix() + si(v) })));
  protected readonly yTicks = computed(() => powersOf10(this.y().domain()).map(v => ({ v, at: this.y()(v), label: si(v) })));

  // Biggest first, so small countries are drawn on top and stay hoverable
  protected readonly dots = computed(() => {
    const x = this.x(), y = this.y(), r = this.r();
    return this.points()
      .map(p => ({ ...p, cx: x(p.x), cy: y(p.y), r: Math.max(2, r(p.size)) }))
      .sort((a, b) => b.r - a.r);
  });
  // The hovered and the selected dot again, on top of everything, with a ring and a name
  protected readonly marked = computed(() => {
    const ids = new Set([this.selected(), this.hovered()].filter(Boolean));
    const right = this.box().w - M.right;
    return this.dots().filter(d => ids.has(d.id)).map(d => {
      // The name goes right of the dot, or left of it when it would run past the edge (~7 px per character at 12 px bold)
      const flip = d.cx + d.r + 6 + d.label.length * 7 > right;
      return { ...d, isSelected: d.id === this.selected(), labelX: flip ? d.cx - d.r - 6 : d.cx + d.r + 6, anchor: flip ? 'end' : 'start' };
    });
  });
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

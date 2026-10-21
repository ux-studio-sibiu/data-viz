import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { Boundaries } from '../../data/boundaries';
import type { Breaks } from '../../charts/choropleth';
import type { MetricId } from '../../data/co2';

export type View = 'globe' | 'map' | 'scatter';

// The metrics the map can be coloured by (lesson 09). Population is left out: it's context, not part of the story.
export const MAP_METRICS: MetricId[] = ['co2_per_capita', 'co2', 'share_global_cumulative_co2', 'consumption_co2_per_capita', 'gdp_per_capita'];
// How each metric's colour classes are cut (charts/choropleth.ts). Totals and shares span orders of magnitude: 'log'. The
// per-person figures and GDP are spread more evenly: quantiles, with the darkest kept for the top few.
export const METRIC_BREAKS: Partial<Record<MetricId, Breaks>> = { co2: 'log', share_global_cumulative_co2: 'log' };
const DEFAULT_METRIC: MetricId = 'co2_per_capita';
// Lesson 16: the bivariate view's value in ?metric=
export const DIVIDE = 'divide';
// Lesson 14: how many countries can be pinned for comparison. Three lines are easy to tell apart; a fourth starts to be a tangle.
export const MAX_COMPARED = 3;

// The explorer's state, in one root store (lesson 07). What's worth sharing lives in the URL, which is the source of truth:
//   /?country=FRA&view=map&metric=co2
// Reading: `selected` and `view` are computed from the query params. Writing: select() and show() navigate, the URL changes,
// and the computeds follow. A link, a reload, or the back button gives exactly the same screen.
// ≈ Next.js useSearchParams() + router.push({ query }), or nuqs.
@Injectable({ providedIn: 'root' })
export class ExplorerState {
  private readonly router = inject(Router);
  private readonly boundaries = inject(Boundaries);

  // The current query params as a signal: re-read after every navigation
  private readonly params = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.routerState.snapshot.root.queryParamMap)
    ),
    { initialValue: this.router.routerState.snapshot.root.queryParamMap }
  );

  // ?country=fra works too. An unknown code (a typo, an old link) is ignored instead of breaking the page.
  readonly selected = computed(() => {
    const id = this.params().get('country')?.toUpperCase() ?? null;
    return id && this.boundaries.countries().has(id) ? id : null;
  });

  private readonly webglWorks = signal(true);
  readonly webgl = this.webglWorks.asReadonly();
  // Lesson 13 added 'scatter'. Without WebGL the globe falls back to the map; the other two don't need it.
  readonly view = computed<View>(() => {
    const view = this.params().get('view');
    if (view === 'map' || view === 'scatter') return view;
    return this.webglWorks() ? 'globe' : 'map';
  });

  // Lesson 16: the "divide" view (?metric=divide): responsibility × vulnerability, two variables in one bivariate map
  readonly divide = computed(() => this.params().get('metric') === DIVIDE);

  // Lesson 09: what the map is coloured by. Unknown values fall back to the default; the default leaves the URL clean.
  // In the divide view this is its responsibility side, the share of all CO₂ since 1750, so the year range, the series
  // and the scatter's colours keep working from one metric.
  readonly metric = computed<MetricId>(() => {
    const m = this.params().get('metric');
    if (m === DIVIDE) return 'share_global_cumulative_co2';
    return m && MAP_METRICS.includes(m as MetricId) ? (m as MetricId) : DEFAULT_METRIC;
  });

  // Lesson 12: the year the map shows. null = the metric's latest year, which leaves the URL clean.
  readonly year = computed(() => {
    const y = Number(this.params().get('year'));
    return Number.isInteger(y) && y > 0 ? y : null;
  });

  // Lesson 15: countries rise off the globe by their total emissions (?extrude=1)
  readonly extrude = computed(() => this.params().get('extrude') === '1');

  // Lesson 14: the countries pinned for comparison, in the order they were pinned (?compare=DEU,CHN,USA). Unknown codes and
  // repeats are dropped, and anything past the third, so a hand-edited link can't break the tray.
  readonly compared = computed(() => {
    const ids = (this.params().get('compare') ?? '').split(',').map(id => id.trim().toUpperCase());
    return ids.filter((id, i) => this.boundaries.countries().has(id) && ids.indexOf(id) === i).slice(0, MAX_COMPARED);
  });

  // Not in the URL: it changes many times a second and isn't worth sharing. A plain signal, shared by the globe, the map and the search.
  readonly hovered = signal<string | null>(null);

  // A new history entry: the back button undoes a selection
  select(id: string | null) { this.write('country', id, { history: true }); }
  // The rest replace the entry: switching views or metrics isn't something to step back through, and playback writes the
  // year 8 times a second (the back button shouldn't step through 125 years). Defaults leave the URL clean.
  show(view: View) { this.write('view', view === 'globe' ? null : view); }
  showMetric(metric: MetricId | typeof DIVIDE) { this.write('metric', metric === DEFAULT_METRIC ? null : metric); }
  showYear(year: number | null) { this.write('year', year); }
  toggleExtrude() { this.write('extrude', this.extrude() ? null : '1'); }
  // Pin or unpin. A full tray refuses a fourth (the button says so); the last one out leaves the URL clean.
  togglePin(id: string) {
    const now = this.compared();
    const next = now.includes(id) ? now.filter(c => c !== id) : now.length < MAX_COMPARED ? [...now, id] : now;
    this.write('compare', next.length ? next.join(',') : null);
  }

  // One query param; null removes it. The other params stay (defaultQueryParamsHandling: 'merge', app.config.ts).
  private write(key: string, value: string | number | null, { history = false } = {}) {
    this.router.navigate([], { queryParams: { [key]: value }, replaceUrl: !history });
  }
  noWebgl() { this.webglWorks.set(false); }
}

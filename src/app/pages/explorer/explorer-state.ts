import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { Boundaries } from '../../data/boundaries';
import type { MetricId } from '../../data/co2';

export type View = 'globe' | 'map';

// The metrics the map can be coloured by (lesson 09). Population is left out: it's context, not part of the story.
export const MAP_METRICS: MetricId[] = ['co2_per_capita', 'co2', 'share_global_cumulative_co2', 'consumption_co2_per_capita', 'gdp_per_capita'];
const DEFAULT_METRIC: MetricId = 'co2_per_capita';

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
  readonly view = computed<View>(() => (this.webglWorks() && this.params().get('view') !== 'map' ? 'globe' : 'map'));

  // Lesson 09: what the map is coloured by. Unknown values fall back to the default; the default leaves the URL clean.
  readonly metric = computed<MetricId>(() => {
    const m = this.params().get('metric') as MetricId | null;
    return m && MAP_METRICS.includes(m) ? m : DEFAULT_METRIC;
  });

  // Lesson 12: the year the map shows. null = the metric's latest year, which leaves the URL clean.
  readonly year = computed(() => {
    const y = Number(this.params().get('year'));
    return Number.isInteger(y) && y > 0 ? y : null;
  });

  // Lesson 13: the scatter panel is open (?chart=scatter). In the URL, so a link can open it.
  readonly scatter = computed(() => this.params().get('chart') === 'scatter');

  // Not in the URL: it changes many times a second and isn't worth sharing. A plain signal, shared by the globe, the map and the search.
  readonly hovered = signal<string | null>(null);

  // A new history entry: the back button undoes a selection
  select(id: string | null) { this.router.navigate([], { queryParams: { country: id } }); }
  // Replaces the entry: switching views isn't something to step back through. The default view leaves the URL clean.
  show(view: View) { this.router.navigate([], { queryParams: { view: view === 'globe' ? null : view }, replaceUrl: true }); }
  // Replaces the entry, like the view: switching what the map shows isn't something to step back through
  showMetric(metric: MetricId) { this.router.navigate([], { queryParams: { metric: metric === DEFAULT_METRIC ? null : metric }, replaceUrl: true }); }
  // Replaces the entry: playback writes it 8 times a second, and the back button shouldn't step through 125 years
  showYear(year: number | null) { this.router.navigate([], { queryParams: { year }, replaceUrl: true }); }
  // Replaces the entry, like the view: opening a panel isn't a step to go back through
  showScatter(open: boolean) { this.router.navigate([], { queryParams: { chart: open ? 'scatter' : null }, replaceUrl: true }); }
  noWebgl() { this.webglWorks.set(false); }
}

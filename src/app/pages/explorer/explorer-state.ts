import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { Boundaries } from '../../data/boundaries';

export type View = 'globe' | 'map';

// The explorer's state, in one root store (lesson 07). What's worth sharing lives in the URL, which is the source of truth:
//   /?country=FRA&view=map
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

  // Not in the URL: it changes many times a second and isn't worth sharing. A plain signal, shared by the globe, the map and the search.
  readonly hovered = signal<string | null>(null);

  // A new history entry: the back button undoes a selection
  select(id: string | null) { this.router.navigate([], { queryParams: { country: id } }); }
  // Replaces the entry: switching views isn't something to step back through. The default view leaves the URL clean.
  show(view: View) { this.router.navigate([], { queryParams: { view: view === 'globe' ? null : view }, replaceUrl: true }); }
  noWebgl() { this.webglWorks.set(false); }
}

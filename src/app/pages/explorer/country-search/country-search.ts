import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Boundaries } from '../../../data/boundaries';
import { ExplorerState } from '../explorer-state';

const MAX_RESULTS = 8;

// Find a country by typing: the keyboard way into the globe, and the only practical way to reach microstates
// (Vatican, Monaco, Nauru are smaller than a pixel on the globe).
// An ARIA combobox: focus stays in the input, ↑/↓ move a highlighted option (aria-activedescendant), Enter selects, Esc closes.
// The highlighted option also lights up on the globe and the map (ExplorerState.hovered), so you see where it is before choosing.
@Component({
  selector: 'app-country-search',
  templateUrl: './country-search.html',
  styleUrl: './country-search.scss',
  host: { '(document:keydown)': 'onDocumentKey($event)' }
})
export class CountrySearch {
  private readonly boundaries = inject(Boundaries);
  private readonly state = inject(ExplorerState);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0); // index of the highlighted option

  // Code matches first (FRA), then names starting with the query, then names containing it
  protected readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [];
    const rank = (name: string, longName: string, id: string) =>
      id.toLowerCase() === q ? 0 : name.toLowerCase().startsWith(q) || longName.toLowerCase().startsWith(q) ? 1 : name.toLowerCase().includes(q) || longName.toLowerCase().includes(q) ? 2 : -1;
    return [...this.boundaries.countries().values()]
      .map(c => ({ c, r: rank(c.name, c.longName, c.id) }))
      .filter(x => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name))
      .slice(0, MAX_RESULTS)
      .map(x => x.c);
  });

  protected onInput(value: string) {
    this.query.set(value);
    this.active.set(0);
    this.open.set(true);
    this.preview();
  }

  protected onKey(e: KeyboardEvent) {
    const count = this.results().length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!count) return;
      e.preventDefault(); // keep the caret where it is
      this.open.set(true);
      this.active.update(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + count) % count); // wraps around
      this.preview();
    } else if (e.key === 'Enter' && this.open() && count) {
      this.choose(this.results()[this.active()].id);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // don't also minimize the lesson window
      this.close();
    }
  }

  protected choose(id: string) {
    this.state.select(id);
    this.query.set('');
    this.close();
  }

  protected close() {
    this.open.set(false);
    this.state.hovered.set(null);
  }

  // Pointer over an option: highlight it here and on the globe
  protected point(index: number) {
    this.active.set(index);
    this.preview();
  }

  // "/" anywhere (except while typing in another field) jumps to the search, like on GitHub or MDN
  protected onDocumentKey(e: KeyboardEvent) {
    if (e.key !== '/' || (e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    this.input().nativeElement.focus();
  }

  private preview() { this.state.hovered.set(this.results()[this.active()]?.id ?? null); }
}

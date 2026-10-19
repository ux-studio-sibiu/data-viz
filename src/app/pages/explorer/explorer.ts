import { Component, computed, inject, signal } from '@angular/core';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Boundaries } from '../../data/boundaries';
import { Globe } from '../../globe/globe';
import { ExplorerView } from './explorer-view';

const INCOME = { high: 'High income', 'upper-middle': 'Upper-middle income', 'lower-middle': 'Lower-middle income', low: 'Low income' };

// The product page: the globe or the flat map, filling the whole screen. The Globe / Map switch is in the app header.
// Lesson 06: hover and selection are owned here and shared by both views, so switching views keeps the selected country.
@Component({
  selector: 'app-explorer',
  imports: [FlatMap, Globe],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class Explorer {
  protected readonly boundaries = inject(Boundaries);
  protected readonly explorerView = inject(ExplorerView);
  protected readonly hovered = signal<string | null>(null);
  protected readonly selected = signal<string | null>(null);
  protected readonly country = computed(() => this.boundaries.countries().get(this.hovered() ?? ''));
  protected readonly selectedCountry = computed(() => this.boundaries.countries().get(this.selected() ?? ''));
  protected readonly income = INCOME;
}

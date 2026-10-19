import { Component, computed, inject, signal } from '@angular/core';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Boundaries } from '../../data/boundaries';
import { Globe } from '../../globe/globe';
import { ExplorerView } from './explorer-view';

// The product page: the globe or the flat map, filling the whole screen. The Globe / Map switch is in the app header.
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
  protected readonly country = computed(() => this.boundaries.countries().get(this.hovered() ?? ''));
}

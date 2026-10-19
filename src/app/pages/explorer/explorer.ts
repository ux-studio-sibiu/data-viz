import { Component, computed, inject, signal } from '@angular/core';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Boundaries } from '../../data/boundaries';
import { Globe } from '../../globe/globe';

type View = 'globe' | 'map';

// The product page. Two views of the same countries: the globe (lesson 04+) and the flat map (lesson 03), which is also the no-WebGL fallback.
@Component({
  selector: 'app-explorer',
  imports: [FlatMap, Globe],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class Explorer {
  protected readonly boundaries = inject(Boundaries);
  protected readonly hovered = signal<string | null>(null);
  protected readonly country = computed(() => this.boundaries.countries().get(this.hovered() ?? ''));

  // The map stays the default until the globe has countries (lesson 05). Lesson 07 moves this into the URL.
  protected readonly view = signal<View>('map');
  protected readonly webgl = signal(true);

  protected noWebgl() {
    this.webgl.set(false);
    this.view.set('map');
  }
}

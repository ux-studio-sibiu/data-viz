import { Component, computed, inject, signal } from '@angular/core';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Boundaries } from '../../data/boundaries';

// The product page. Lesson 03: a flat SVG map. The globe replaces it in lesson 04, and the map stays as the no-WebGL fallback.
@Component({
  selector: 'app-explorer',
  imports: [FlatMap],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class Explorer {
  protected readonly boundaries = inject(Boundaries);
  protected readonly hovered = signal<string | null>(null);
  protected readonly country = computed(() => this.boundaries.countries().get(this.hovered() ?? ''));
}

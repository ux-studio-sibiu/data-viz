import { Component, computed, input, model } from '@angular/core';
import { geoEqualEarth, geoGraticule10, geoPath } from 'd3-geo';
import type { CountryFeature } from '../../data/boundaries';

// The fixed drawing size. The SVG scales to any width through its viewBox, so the projection never has to be refitted on resize.
const W = 960, H = 500;

// D3 does the math, Angular renders the DOM:
//   d3-geo turns [lon, lat] polygons into SVG path strings, once, in computed()
//   the template draws one <path> per country with @for, and Angular keeps it in sync
// ≈ in React: useMemo(() => features.map(f => path(f))) + <path d={…} /> in JSX. No d3.select(), no .enter()/.join().
@Component({
  selector: 'app-flat-map',
  templateUrl: './flat-map.html',
  styleUrl: './flat-map.scss'
})
export class FlatMap {
  readonly features = input.required<CountryFeature[]>();
  readonly hovered = model<string | null>(null); // two-way: the parent can read it, and set it from elsewhere (a list, a search)
  readonly label = input('World map');

  protected readonly viewBox = `0 0 ${W} ${H}`;

  // Equal Earth: an equal-area projection, so country sizes compare honestly (Mercator would make Greenland look as big as Africa)
  private readonly projection = computed(() => geoEqualEarth().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' }));
  private readonly path = computed(() => geoPath(this.projection()));

  protected readonly sphere = computed(() => this.path()({ type: 'Sphere' }) ?? '');
  protected readonly graticule = computed(() => this.path()(geoGraticule10()) ?? '');
  protected readonly countries = computed(() => this.features().map(f => ({ id: f.id, name: f.properties.name, d: this.path()(f) ?? '' })));

  protected readonly active = computed(() => this.countries().find(c => c.id === this.hovered()));
  // Tooltip anchor: the label point from Natural Earth, projected, as a % of the drawing so it scales with the SVG.
  // (A centroid would land in the Atlantic for France, which includes French Guiana.)
  protected readonly anchor = computed(() => {
    const f = this.features().find(c => c.id === this.hovered());
    const p = f && this.projection()(f.properties.label);
    return p ? { left: (p[0] / W) * 100, top: (p[1] / H) * 100 } : null;
  });

  // Event delegation: one listener on the group instead of 240 on the paths (≈ jQuery .on('pointerover', 'path', fn))
  protected onOver(e: PointerEvent) {
    const id = (e.target as Element).getAttribute('data-id');
    if (id) this.hovered.set(id);
  }
}

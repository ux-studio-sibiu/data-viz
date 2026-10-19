import { httpResource } from '@angular/common/http';
import { computed, Injectable } from '@angular/core';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { CountriesFile, Country } from './country';

export type CountryFeature = Feature<Polygon | MultiPolygon, { name: string; label: [number, number] }> & { id: string };

// Loads the two files from lesson 02 once, for the whole app (providedIn: 'root' ≈ a module-level singleton).
// Two httpResources run in parallel; `features` is ready when both are.
@Injectable({ providedIn: 'root' })
export class Boundaries {
  private readonly topology = httpResource<Topology<{ countries: GeometryCollection }>>(() => 'data/countries-50m.topo.json');
  private readonly meta = httpResource<CountriesFile>(() => 'data/countries.json');

  readonly isLoading = computed(() => this.topology.isLoading() || this.meta.isLoading());
  readonly error = computed(() => this.topology.error() ?? this.meta.error());

  // id → metadata ('FRA' → France). A Map: lookups by id happen on every hover.
  readonly countries = computed(() => new Map<string, Country>((this.meta.value()?.countries ?? []).map(c => [c.id, c])));

  // TopoJSON → GeoJSON features (what d3-geo and, later, the globe draw), with name and label point attached.
  // computed() runs this once when both files have arrived, not on every read.
  readonly features = computed<CountryFeature[]>(() => {
    const topo = this.topology.value(), countries = this.countries();
    if (!topo || !countries.size) return [];
    const collection = feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon>;
    return collection.features.map(f => {
      const c = countries.get(String(f.id));
      return { ...f, id: String(f.id), properties: { name: c?.name ?? String(f.id), label: c?.label ?? [0, 0] } };
    });
  });
}

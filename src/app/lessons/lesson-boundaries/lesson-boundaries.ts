import { httpResource } from '@angular/common/http';
import { JsonPipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { CountriesFile } from '../../data/country';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-boundaries',
  imports: [LessonPage, JsonPipe],
  templateUrl: './lesson-boundaries.html',
  styleUrl: './lesson-boundaries.scss'
})
export class LessonBoundaries {
  // httpResource: a GET as a signal (≈ useSWR / TanStack Query). value(), isLoading(), error() update by themselves.
  // The URL is relative to <base href="/">, and public/ is served at the root, so public/data/… → data/…
  protected readonly file = httpResource<CountriesFile>(() => 'data/countries.json');
  protected readonly countries = computed(() => this.file.value()?.countries ?? []);

  protected readonly byContinent = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.countries()) counts.set(c.continent, (counts.get(c.continent) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  });
  protected readonly withoutIso = computed(() => this.countries().filter(c => !c.hasIsoCode));
  protected readonly dependencies = computed(() => this.countries().filter(c => c.sovereign).length);

  // Look up one record: try "FRA", "Greenland", "Kosovo"
  protected readonly query = signal('GRL');
  protected readonly match = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.countries().find(c => c.id.toLowerCase() === q || c.name.toLowerCase().startsWith(q)) : undefined;
  });
}

import { HttpResourceRef } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boundaries } from '../../data/boundaries';
import { latest, MetricId, MetricSeries } from '../../data/co2';
import { Co2Data } from '../../data/co2-data';
import { LessonPage } from '../lesson-page/lesson-page';
import { figure } from '../../data/format';


@Component({
  selector: 'app-lesson-co2-data',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-co2-data.html',
  styleUrl: './lesson-co2-data.scss'
})
export class LessonCo2Data {
  protected readonly co2 = inject(Co2Data);
  private readonly boundaries = inject(Boundaries);

  // The inspector: pick a metric, see its definition, coverage and top 8 countries.
  // The resource is created in the change handler, not in a computed: creating a resource is a side effect
  // (it starts a request and registers effects), and computeds must stay pure.
  protected readonly metricId = signal<MetricId>('co2_per_capita');
  protected readonly series = signal<HttpResourceRef<MetricSeries | undefined>>(this.co2.metric('co2_per_capita'));
  protected readonly info = computed(() => this.co2.meta.value()?.metrics.find(m => m.id === this.metricId()));

  protected readonly top = computed(() => {
    const series = this.series().value(), info = this.info(), countries = this.boundaries.countries();
    if (!series || !info) return [];
    return Object.keys(series.values)
      .map(id => ({ id, name: countries.get(id)?.name ?? id, reading: latest(series, id, info.lastYear) }))
      .filter(x => x.reading?.year === info.lastYear)
      .sort((a, b) => b.reading!.value - a.reading!.value)
      .slice(0, 8);
  });
  protected readonly noDataNames = computed(() => (this.co2.meta.value()?.noData ?? []).map(id => this.boundaries.countries().get(id)?.name ?? id));

  protected choose(id: string) {
    this.metricId.set(id as MetricId);
    this.series.set(this.co2.metric(id as MetricId));
  }

  protected format(n: number) { return figure.format(n); }
}

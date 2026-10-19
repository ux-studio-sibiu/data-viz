import { httpResource, HttpResourceRef } from '@angular/common/http';
import { inject, Injectable, Injector } from '@angular/core';
import { MetricId, MetricSeries, parseMeta, parseSeries } from './co2';

// Loads the CO₂ data from lesson 08, for the whole app.
// meta.json up front (small, describes every metric); each metric's file only when someone asks for it, then shared.
@Injectable({ providedIn: 'root' })
export class Co2Data {
  private readonly injector = inject(Injector);

  // `parse` runs on the raw JSON before it becomes value(): a file of the wrong shape becomes error(), not bad data
  readonly meta = httpResource(() => 'data/co2/meta.json', { parse: parseMeta });

  // One resource per metric, created the first time it's asked for and then reused: two components asking for
  // co2_per_capita share one request. httpResource needs an injection context; outside the constructor we pass the injector.
  private readonly series = new Map<MetricId, HttpResourceRef<MetricSeries | undefined>>();

  metric(id: MetricId): HttpResourceRef<MetricSeries | undefined> {
    let ref = this.series.get(id);
    if (!ref) this.series.set(id, (ref = httpResource(() => `data/co2/${id}.json`, { parse: parseSeries, injector: this.injector })));
    return ref;
  }
}

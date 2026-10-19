import { Injectable, signal } from '@angular/core';

export type View = 'globe' | 'map';

// Which view the explorer shows. A root service because the switch lives in the app header and the views in the explorer,
// far apart in the component tree. Lesson 07 moves this into the URL.
@Injectable({ providedIn: 'root' })
export class ExplorerView {
  readonly view = signal<View>('globe');
  readonly webgl = signal(true); // false once the globe reports that WebGL isn't available

  noWebgl() {
    this.webgl.set(false);
    this.view.set('map');
  }
}

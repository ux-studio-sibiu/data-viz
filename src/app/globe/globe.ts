import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, Injector, input, model, output, signal, untracked, viewChild } from '@angular/core';
import type { CountryFeature } from '../data/boundaries';
import { MotionPreference } from '../shared/motion-preference';
import { GlobeScene } from './globe-scene';

// The Angular side of the globe: inputs and outputs, the tooltip, and effects that pass signals to the scene.
// Everything Three.js (renderer, camera, render loop, picking, flights) lives in GlobeScene, a plain class.
// ≈ in React: a component with a ref to a canvas, and a useEffect per prop that calls methods on an imperative object.
//
// The learn-angular lesson 15 recipe, zoneless:
//   viewChild → canvas · afterNextRender → create · effects → inputs drive the scene · DestroyRef → dispose
@Component({
  selector: 'app-globe',
  template: `
    <canvas #canvas class="nsc-globe" [class.is-over-country]="pointerOnCountry()" role="img" [attr.aria-label]="label()"></canvas>
    <!-- Lesson 06: content from the parent, moved with the pointer by writing style.translate directly (no signal per mouse move) -->
    <div #tooltip class="tooltip" [hidden]="!pointerOnCountry()"><ng-content select="[globe-tooltip]" /></div>
  `,
  styles: `
    :host { display: block; position: relative; }
    .nsc-globe { display: block; width: 100%; height: 100%; cursor: grab; }
    .nsc-globe.is-over-country { cursor: pointer; }
    .nsc-globe:active { cursor: grabbing; }
    .tooltip {
      position: absolute; top: 0; left: 0; pointer-events: none; margin: 14px 0 0 14px;
      padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
      font-size: 0.85rem; white-space: nowrap; box-shadow: 0 4px 16px var(--shadow);
    }
  `
})
export class Globe {
  readonly features = input<CountryFeature[]>([]); // lesson 05: drawn through the ID map
  readonly borders = input<number[][][]>([]);       // lesson 05: every border once, as [lon, lat] lines
  readonly hovered = model<string | null>(null);   // lesson 06: two-way, like FlatMap's, so either view can light up a country
  readonly selected = model<string | null>(null);  // lesson 06: set by a click; lesson 10: the camera flies to it
  readonly autoRotate = input(true);
  readonly label = input('A globe you can rotate by dragging and zoom with the mouse wheel or a pinch. Click a country to select it.');
  readonly unsupported = output(); // no WebGL: the parent shows the flat map instead

  protected readonly pointerOnCountry = signal(false); // only the pointer shows the tooltip, not a hover coming from elsewhere

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly tooltip = viewChild.required<ElementRef<HTMLElement>>('tooltip');

  constructor() {
    const destroyRef = inject(DestroyRef), injector = inject(Injector), motion = inject(MotionPreference);

    afterNextRender(() => {
      const tooltip = this.tooltip().nativeElement;
      let scene: GlobeScene;
      try {
        scene = new GlobeScene(this.canvas().nativeElement, {
          hover: (id, x, y) => {
            if (id !== this.hovered()) this.hovered.set(id); // a signal write only when the country changes, not on every move
            this.pointerOnCountry.set(!!id);
            tooltip.style.translate = `${x}px ${y}px`;       // per-move position: straight to the DOM
          },
          select: id => this.selected.set(id)
        });
      } catch {
        this.unsupported.emit(); // WebGL disabled, blocklisted GPU, or too many contexts
        return;
      }

      // --- inputs → scene. Created here, after the scene exists; the injector ties them to this component. ---
      effect(() => scene.setAutoRotate(this.autoRotate() && !motion.reduced()), { injector });
      effect(() => scene.setFeatures(this.features()), { injector });
      effect(() => scene.setBorders(this.borders()), { injector });
      effect(() => scene.setHighlight(this.hovered(), this.selected()), { injector });

      // Selected → fly there. Also on load with ?country=… in the URL, and when switching from the map with a country selected.
      // untracked(): only the selection and the features should re-run this, not what the flight reads.
      effect(() => {
        const id = this.selected(), feature = this.features().find(f => f.id === id);
        if (feature) untracked(() => scene.flyTo(feature, motion.reduced()));
      }, { injector });

      destroyRef.onDestroy(() => scene.dispose());
    });
  }
}

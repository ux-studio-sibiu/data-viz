import { Component } from '@angular/core';

// The page behind the globe and the map: white paper with a faint graph-paper grid, as on a drafting sheet.
// Chosen with a temporary tuner (lesson 12) from the texture kit's pattern tiles: graph-paper, ink at 8%, 1.15× its size.
// Like the kit, the SVG tile is a MASK over a box filled with ink: only the tile's shape matters, the colour comes from CSS.
// The tile is Hero Patterns' "Graph Paper" by Steve Schoger (heropatterns.com, CC BY 4.0), copied in from
// effects-collection/randomize-studio/overlay-patterns/: credited on the methodology page (lesson 19).
// The mask URL is set from the template, not the stylesheet, so the build doesn't try to resolve it as a source file.
const TILE = { url: 'textures/graph-paper.svg', size: 100 * 1.15 };

@Component({
  selector: 'app-backdrop',
  template: `<div class="nsc-backdrop" aria-hidden="true"><div class="grid" [style.mask]="mask" [style.-webkit-mask]="mask"></div></div>`,
  styles: `
    :host { display: block; position: absolute; inset: 0; pointer-events: none; }
    .nsc-backdrop { position: absolute; inset: 0; background: var(--bg); }
    .grid { position: absolute; inset: 0; background: var(--ink); opacity: 0.08; }
  `
})
export class Backdrop {
  protected readonly mask = `url("${TILE.url}") 0 0 / ${TILE.size}px ${TILE.size}px repeat`;
}

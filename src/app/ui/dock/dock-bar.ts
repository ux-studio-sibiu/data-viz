import { Component, inject } from '@angular/core';
import { Dock } from './dock';

// Minimized windows, docked at the bottom centre. Click one to restore it where it was.
@Component({
  selector: 'app-dock-bar',
  template: `
    @if (dock.items().length) {
      <nav class="nsc-dock-bar" aria-label="Minimized windows">
        @for (item of dock.items(); track item.id) { <button type="button" (click)="item.restore()"><span aria-hidden="true">▭</span> {{ item.label }}</button> }
      </nav>
    }
  `,
  styles: `
    .nsc-dock-bar {
      position: fixed; left: 50%; translate: -50% 0; bottom: 16px; z-index: 30; display: flex; gap: 8px;

      button {
        height: 32px; padding: 0 12px; border: 2px solid var(--ink); border-radius: 0; background: var(--surface); color: var(--fg); cursor: pointer;
        box-shadow: 3px 5px #00000033; font-family: var(--ui-mono); font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
      }
      button:hover { background: var(--ink); color: var(--surface); }
    }
  `
})
export class DockBar {
  protected readonly dock = inject(Dock);
}

import { Component, inject } from '@angular/core';
import { Dock } from './dock';

// Minimized windows, docked at the bottom-left. Click one to restore it where it was.
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
      position: fixed; left: 16px; bottom: 16px; z-index: 30; display: flex; gap: 8px;

      button { font: inherit; font-size: 0.85rem; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--fg); cursor: pointer; }
      button:hover { border-color: var(--accent); }
    }
  `
})
export class DockBar {
  protected readonly dock = inject(Dock);
}

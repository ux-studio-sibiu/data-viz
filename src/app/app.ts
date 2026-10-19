import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { LessonWindow } from './lessons/lesson-window/lesson-window';
import { ExplorerView } from './pages/explorer/explorer-view';
import { DockBar } from './ui/dock/dock-bar';

// Root component ≈ Next.js app/layout.tsx: a small floating header, then whichever page matches the URL.
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, LessonWindow, DockBar],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly router = inject(Router);
  protected readonly explorerView = inject(ExplorerView);

  // Is the explorer the page underneath (primary outlet ''), whatever the lesson window shows?
  // routerLinkActive can't answer this: with "(lesson:…)" in the URL, the "/" link no longer matches exactly.
  protected readonly onExplorer = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.routerState.snapshot.root.children.find(c => c.outlet === 'primary')?.routeConfig?.path === '')
    ),
    { initialValue: false }
  );
}

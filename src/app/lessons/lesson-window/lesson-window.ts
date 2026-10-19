import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { FloatingPanel } from '../../ui/floating-panel/floating-panel';
import { lessonRoutes } from '../lessons.routes';

// The only lesson-specific frame: a FloatingPanel around the named "lesson" outlet.
// URL /(lesson:lessons/setup) = the product in the primary outlet + lesson 00 in this window.
// After every navigation it reads the "lesson" branch of the router state: present = shown, absent = hidden.
@Component({
  selector: 'app-lesson-window',
  imports: [FloatingPanel, RouterOutlet],
  templateUrl: './lesson-window.html',
  host: { '[hidden]': '!active()', '(document:keydown)': 'onKey($event)' }
})
export class LessonWindow {
  private readonly router = inject(Router);
  private readonly paths = lessonRoutes.map(r => r.path ?? ''); // ['', 'setup', …]: the roadmap first, then lessons in order

  protected readonly active = signal(false);
  protected readonly minimized = signal(false);
  protected readonly path = signal(''); // kept after closing, so L reopens the last lesson
  protected readonly title = signal('Lessons');
  protected readonly prev = computed(() => this.paths[this.paths.indexOf(this.path()) - 1]);
  protected readonly next = computed(() => this.paths[this.paths.indexOf(this.path()) + 1]);

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.sync());
  }

  // The outlet's branch starts at the componentless 'lessons' parent; the lesson is its deepest child
  private sync() {
    let lesson = this.router.routerState.snapshot.root.children.find(c => c.outlet === 'lesson');
    this.active.set(!!lesson);
    this.minimized.set(false);
    if (!lesson) return;
    while (lesson.firstChild) lesson = lesson.firstChild;
    this.path.set(lesson.routeConfig?.path ?? '');
    this.title.set(lesson.title ?? 'Lessons');
  }

  // Commands with `outlets` change only the named outlet; the primary route (the product) stays as it is
  protected open(path: string) { this.router.navigate([{ outlets: { lesson: path ? ['lessons', path] : ['lessons'] } }]); }
  protected close() { this.router.navigate([{ outlets: { lesson: null } }]); }
  // The same lesson as a full page: set the primary outlet and clear this one in a single navigation
  protected openFullPage() { this.router.navigate([{ outlets: { primary: ['lessons', ...(this.path() ? [this.path()] : [])], lesson: null } }]); }

  // L toggles the window, unless you're typing somewhere
  protected onKey(e: KeyboardEvent) {
    if (e.key.toLowerCase() !== 'l' || e.ctrlKey || e.metaKey || e.altKey || (e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
    if (this.active()) this.close();
    else this.open(this.path());
  }
}

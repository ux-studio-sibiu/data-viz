import { Routes } from '@angular/router';

// One entry per lesson. Each page is its own lazy chunk (≈ next/dynamic).
export const lessonRoutes: Routes = [
  { path: '', loadComponent: () => import('./roadmap/roadmap').then(m => m.Roadmap), title: 'Lessons' },
  { path: 'setup', loadComponent: () => import('./lesson-setup/lesson-setup').then(m => m.LessonSetup), title: '00 Setup' }
];

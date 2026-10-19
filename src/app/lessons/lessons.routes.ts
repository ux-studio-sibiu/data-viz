import { Routes } from '@angular/router';

// One entry per lesson, in order (the lesson window's prev/next follow this order). Each page is its own lazy chunk (≈ next/dynamic).
export const lessonRoutes: Routes = [
  { path: '', loadComponent: () => import('./roadmap/roadmap').then(m => m.Roadmap), title: 'Roadmap' },
  { path: 'setup', loadComponent: () => import('./lesson-setup/lesson-setup').then(m => m.LessonSetup), title: '00 Setup' },
  { path: 'floating-window', loadComponent: () => import('./lesson-floating-window/lesson-floating-window').then(m => m.LessonFloatingWindow), title: '01 The lesson window' },
  { path: 'boundaries', loadComponent: () => import('./lesson-boundaries/lesson-boundaries').then(m => m.LessonBoundaries), title: '02 Data pipeline: boundaries' }
];

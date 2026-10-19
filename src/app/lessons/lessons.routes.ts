import { Routes } from '@angular/router';

// One entry per lesson, in order (the lesson window's prev/next follow this order). Each page is its own lazy chunk (≈ next/dynamic).
export const lessonRoutes: Routes = [
  { path: '', loadComponent: () => import('./roadmap/roadmap').then(m => m.Roadmap), title: 'Roadmap' },
  { path: 'setup', loadComponent: () => import('./lesson-setup/lesson-setup').then(m => m.LessonSetup), title: '00 Setup' },
  { path: 'floating-window', loadComponent: () => import('./lesson-floating-window/lesson-floating-window').then(m => m.LessonFloatingWindow), title: '01 The lesson window' },
  { path: 'boundaries', loadComponent: () => import('./lesson-boundaries/lesson-boundaries').then(m => m.LessonBoundaries), title: '02 Data pipeline: boundaries' },
  { path: 'flat-map', loadComponent: () => import('./lesson-flat-map/lesson-flat-map').then(m => m.LessonFlatMap), title: '03 Flat map first' },
  { path: 'globe', loadComponent: () => import('./lesson-globe/lesson-globe').then(m => m.LessonGlobe), title: '04 The globe' },
  { path: 'countries-globe', loadComponent: () => import('./lesson-countries-globe/lesson-countries-globe').then(m => m.LessonCountriesGlobe), title: '05 Countries on the sphere' },
  { path: 'picking', loadComponent: () => import('./lesson-picking/lesson-picking').then(m => m.LessonPicking), title: '06 Picking' },
  { path: 'state-url', loadComponent: () => import('./lesson-state-url/lesson-state-url').then(m => m.LessonStateUrl), title: '07 Stores and the URL' },
  { path: 'fly-to', loadComponent: () => import('./lesson-fly-to/lesson-fly-to').then(m => m.LessonFlyTo), title: '10 Fly to a country' } // pulled forward
];

import { Routes } from '@angular/router';
import { Explorer } from './pages/explorer/explorer';

// The product lives at '' and ships in the main bundle. Lessons are a lazy route subtree (their own chunks).
// Lesson 01 renders the same lesson routes a second time, in a named outlet inside a floating window.
export const routes: Routes = [
  { path: '', component: Explorer, title: 'The Carbon Divide' },
  { path: 'lessons', loadChildren: () => import('./lessons/lessons.routes').then(m => m.lessonRoutes) },
  { path: '**', redirectTo: '' }
];

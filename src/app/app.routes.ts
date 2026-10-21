import { Routes } from '@angular/router';
import { Explorer } from './pages/explorer/explorer';

// The product lives at '' and ships in the main bundle. Lessons are a lazy route subtree (their own chunks).
export const routes: Routes = [
  { path: '', component: Explorer, title: 'The Carbon Divide' },
  // Lesson 17: the scroll-driven story, its own lazy chunk (with GSAP's ScrollTrigger)
  { path: 'story', loadComponent: () => import('./pages/story/story').then(m => m.Story), title: 'The Carbon Divide: the story' },
  { path: 'lessons', loadChildren: () => import('./lessons/lessons.routes').then(m => m.lessonRoutes) },
  // Lesson 01: the same lesson routes again, for the named outlet in the lesson window → /(lesson:lessons/setup)
  // ≈ Next.js parallel routes (@lesson slot) + intercepting routes, the "modal with its own URL" pattern
  { path: 'lessons', outlet: 'lesson', loadChildren: () => import('./lessons/lessons.routes').then(m => m.lessonRoutes) },
  { path: '**', redirectTo: '' }
];

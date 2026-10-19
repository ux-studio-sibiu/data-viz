import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';

import { routes } from './app.routes';

// Zoneless is the default since Angular 21: no zone.js, no provideZoneChangeDetection().
// The screen updates only when a signal read by a template changes (or an event/async pipe marks it dirty).
// No SSR either: everything here runs in the browser, so Three.js and GSAP can start without platform checks.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Lesson 07: every navigation keeps the current query params (?country=FRA&view=map) unless it sets them itself.
    // Without this, opening a lesson in the window, or any routerLink, would drop the selection.
    provideRouter(routes, withRouterConfig({ defaultQueryParamsHandling: 'merge' })),
    // Lesson 02: HttpClient (and httpResource) for the JSON in public/data. withFetch() uses fetch() instead of XHR.
    provideHttpClient(withFetch())
  ]
};

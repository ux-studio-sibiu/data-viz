import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

// Zoneless is the default since Angular 21: no zone.js, no provideZoneChangeDetection().
// The screen updates only when a signal read by a template changes (or an event/async pipe marks it dirty).
// No SSR either: everything here runs in the browser, so Three.js and GSAP can start without platform checks.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Lesson 02: HttpClient (and httpResource) for the JSON in public/data. withFetch() uses fetch() instead of XHR.
    provideHttpClient(withFetch())
  ]
};

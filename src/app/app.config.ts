import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { csrfInterceptor } from './core/auth/csrf-token';
import { sessionEndedInterceptor } from './core/auth/session-ended.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Same-origin API (dev proxy or reverse proxy), so the session cookie is sent automatically.
    provideHttpClient(withFetch(), withInterceptors([csrfInterceptor, sessionEndedInterceptor])),
  ],
};

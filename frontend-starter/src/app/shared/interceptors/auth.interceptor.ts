import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** List of public endpoints that do not require Authorization header. */
const PUBLIC_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/health'];

/**
 * Adds the bearer token to protected API requests and handles 401 responses.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const token = authService.token();
  const isPublic = PUBLIC_ENDPOINTS.some((url) => request.url.includes(url));

  const authRequest =
    token && !isPublic
      ? request.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        })
      : request;

  return next(authRequest).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isPublic) {
        authService.handleUnauthorized();
      }
      return throwError(() => error);
    }),
  );
};

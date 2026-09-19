import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;
  let mockAuthService: {
    token: ReturnType<typeof vi.fn>;
    handleUnauthorized: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuthService = {
      token: vi.fn().mockReturnValue(null),
      handleUnauthorized: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should add Authorization Bearer token on protected routes when token is present', () => {
    mockAuthService.token.mockReturnValue('test-bearer-token');

    httpClient.get('/api/tracks').subscribe();

    const req = httpTesting.expectOne('/api/tracks');
    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-bearer-token');
    req.flush([]);
  });

  it('should not add Authorization header when token is null', () => {
    mockAuthService.token.mockReturnValue(null);

    httpClient.get('/api/tracks').subscribe();

    const req = httpTesting.expectOne('/api/tracks');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('should not add Authorization header on public endpoints even if token is present', () => {
    mockAuthService.token.mockReturnValue('valid-token');

    httpClient.post('/api/auth/login', { email: 'a@b.com', password: '123' }).subscribe();
    const reqLogin = httpTesting.expectOne('/api/auth/login');
    expect(reqLogin.request.headers.has('Authorization')).toBe(false);
    reqLogin.flush({});

    httpClient.post('/api/auth/register', {}).subscribe();
    const reqRegister = httpTesting.expectOne('/api/auth/register');
    expect(reqRegister.request.headers.has('Authorization')).toBe(false);
    reqRegister.flush({});

    httpClient.get('/api/health').subscribe();
    const reqHealth = httpTesting.expectOne('/api/health');
    expect(reqHealth.request.headers.has('Authorization')).toBe(false);
    reqHealth.flush({ status: 'ok' });
  });

  it('should call handleUnauthorized and propagate error on 401 response for protected routes', () => {
    mockAuthService.token.mockReturnValue('expired-token');

    let receivedError: HttpErrorResponse | undefined;
    httpClient.get('/api/users/me').subscribe({
      error: (err: HttpErrorResponse) => {
        receivedError = err;
      },
    });

    const req = httpTesting.expectOne('/api/users/me');
    req.flush({ message: 'Token invalide' }, { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.handleUnauthorized).toHaveBeenCalledTimes(1);
    expect(receivedError).toBeDefined();
    expect(receivedError?.status).toBe(401);
  });

  it('should NOT call handleUnauthorized on 401 response for login endpoint', () => {
    let receivedError: HttpErrorResponse | undefined;
    httpClient.post('/api/auth/login', {}).subscribe({
      error: (err: HttpErrorResponse) => {
        receivedError = err;
      },
    });

    const req = httpTesting.expectOne('/api/auth/login');
    req.flush({ message: 'Identifiants incorrects' }, { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.handleUnauthorized).not.toHaveBeenCalled();
    expect(receivedError?.status).toBe(401);
  });
});

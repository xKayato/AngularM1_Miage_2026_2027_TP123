import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;
  let mockRouter: { navigate: ReturnType<typeof vi.fn>; url: string };

  const mockUser: User = {
    id: 'user-123',
    name: 'Alice',
    email: 'alice@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const mockAuthResponse: AuthResponse = {
    token: 'jwt-fake-token-xyz',
    user: mockUser,
  };

  beforeEach(() => {
    localStorage.clear();
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
      url: '/tracks',
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: mockRouter },
      ],
    });

    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should initialize with anonymous status when no token in localStorage', () => {
    expect(service.token()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.authStatus()).toBe('anonymous');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should successfully log in, store token in localStorage, and update signals', () => {
    service.login('  Alice@Example.COM  ', 'password123').subscribe((res) => {
      expect(res).toEqual(mockAuthResponse);
    });

    const req = httpTesting.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    // Normalization check: email should be trimmed and lowercase
    expect(req.request.body).toEqual({
      email: 'alice@example.com',
      password: 'password123',
    });

    req.flush(mockAuthResponse);

    expect(localStorage.getItem('gpc_token')).toBe('jwt-fake-token-xyz');
    expect(service.token()).toBe('jwt-fake-token-xyz');
    expect(service.currentUser()).toEqual(mockUser);
    expect(service.authStatus()).toBe('authenticated');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should successfully register, store token in localStorage, and update signals', () => {
    service.register('  Alice  ', '  ALICE@example.com ', 'Secret1234').subscribe((res) => {
      expect(res).toEqual(mockAuthResponse);
    });

    const req = httpTesting.expectOne('/api/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'Secret1234',
    });

    req.flush(mockAuthResponse);

    expect(localStorage.getItem('gpc_token')).toBe('jwt-fake-token-xyz');
    expect(service.currentUser()).toEqual(mockUser);
    expect(service.authStatus()).toBe('authenticated');
  });

  it('should fetch user profile and update currentUser signal', () => {
    service.profile().subscribe((user) => {
      expect(user).toEqual(mockUser);
    });

    const req = httpTesting.expectOne('/api/users/me');
    expect(req.request.method).toBe('GET');

    req.flush(mockUser);

    expect(service.currentUser()).toEqual(mockUser);
    expect(service.authStatus()).toBe('authenticated');
  });

  it('should update user name and update currentUser signal', () => {
    const updatedUser = { ...mockUser, name: 'Alice Bob' };

    service.update('  Alice Bob  ').subscribe((user) => {
      expect(user.name).toBe('Alice Bob');
    });

    const req = httpTesting.expectOne('/api/users/me');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Alice Bob' });

    req.flush(updatedUser);

    expect(service.currentUser()).toEqual(updatedUser);
  });

  it('clearSession should clear localStorage and reset signals without routing', () => {
    localStorage.setItem('gpc_token', 'token-to-delete');
    service.token.set('token-to-delete');
    service.currentUser.set(mockUser);
    service.authStatus.set('authenticated');

    service.clearSession();

    expect(localStorage.getItem('gpc_token')).toBeNull();
    expect(service.token()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.authStatus()).toBe('anonymous');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('logout should call clearSession and navigate to /login', () => {
    service.token.set('some-token');
    service.logout();

    expect(service.token()).toBeNull();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('initializeSession should fetch profile when token is present and authenticate upon success', () => {
    service.token.set('existing-token');

    service.initializeSession();

    expect(service.authStatus()).toBe('loading');

    const req = httpTesting.expectOne('/api/users/me');
    req.flush(mockUser);

    expect(service.authStatus()).toBe('authenticated');
    expect(service.currentUser()).toEqual(mockUser);
  });

  it('initializeSession should clear session when profile request returns 401', () => {
    service.token.set('expired-token');

    service.initializeSession();

    const req = httpTesting.expectOne('/api/users/me');
    req.flush({ message: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.token()).toBeNull();
    expect(service.authStatus()).toBe('anonymous');
  });
});

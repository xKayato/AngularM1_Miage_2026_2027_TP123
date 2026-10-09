import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';
import { signal } from '@angular/core';
import { User } from '../models/user.model';

describe('adminGuard', () => {
  let authServiceMock: {
    isAdmin: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    createUrlTree: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authServiceMock = {
      isAdmin: vi.fn(),
    };
    routerMock = {
      createUrlTree: vi.fn().mockImplementation((commands) => ({ url: commands.join('/') } as unknown as UrlTree)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('autorise l\'accès si l\'utilisateur est administrateur', () => {
    authServiceMock.isAdmin.mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBe(true);
    expect(routerMock.createUrlTree).not.toHaveBeenCalled();
  });

  it('bloque l\'accès et redirige vers /posts si l\'utilisateur n\'est pas administrateur', () => {
    authServiceMock.isAdmin.mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).not.toBe(true);
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/posts']);
  });
});

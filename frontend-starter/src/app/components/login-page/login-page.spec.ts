import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { LoginPageComponent } from './login-page';
import { AuthService } from '../../shared/services/auth.service';
import { AuthResponse } from '../../shared/models/auth-response.model';

describe('LoginPageComponent', () => {
  let component: LoginPageComponent;
  let fixture: ComponentFixture<LoginPageComponent>;
  let router: Router;
  let mockAuthService: {
    login: ReturnType<typeof vi.fn>;
  };

  const mockResponse: AuthResponse = {
    token: 'valid-token',
    user: {
      id: '1',
      name: 'Demo',
      email: 'demo@example.com',
      createdAt: '2026-01-01',
    },
  };

  beforeEach(async () => {
    mockAuthService = {
      login: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component with initial form values', () => {
    expect(component).toBeTruthy();
    expect(component.form.valid).toBe(true);
    expect(component.submitting()).toBe(false);
  });

  it('should not call auth.login and should mark controls as touched if form is invalid', () => {
    component.form.controls.email.setValue('');
    component.form.controls.password.setValue('');

    component.submit();

    expect(component.form.controls.email.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
    expect(mockAuthService.login).not.toHaveBeenCalled();
  });

  it('should call auth.login and navigate to /tracks on successful submission', () => {
    mockAuthService.login.mockReturnValue(of(mockResponse));
    component.form.setValue({
      email: 'demo@example.com',
      password: 'Demo1234!',
    });

    component.submit();

    expect(mockAuthService.login).toHaveBeenCalledWith('demo@example.com', 'Demo1234!');
    expect(component.submitting()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tracks');
    expect(component.error()).toBe('');
  });

  it('should display error message on 401 unauthorized response', () => {
    const error401 = new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
      error: { message: 'Identifiants incorrects' },
    });
    mockAuthService.login.mockReturnValue(throwError(() => error401));

    component.submit();

    expect(component.submitting()).toBe(false);
    expect(component.error()).toBe('Identifiants incorrects (email ou mot de passe invalide)');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('should display network error message when status is 0', () => {
    const errorNetwork = new HttpErrorResponse({
      status: 0,
      statusText: 'Unknown Error',
    });
    mockAuthService.login.mockReturnValue(throwError(() => errorNetwork));

    component.submit();

    expect(component.submitting()).toBe(false);
    expect(component.error()).toContain('Impossible de joindre le serveur');
  });

  it('should prevent double submission while submitting', () => {
    mockAuthService.login.mockReturnValue(of(mockResponse));
    component.submitting.set(true);

    component.submit();

    expect(mockAuthService.login).not.toHaveBeenCalled();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { RegisterPageComponent } from './register-page';
import { AuthService } from '../../shared/services/auth.service';
import { AuthResponse } from '../../shared/models/auth-response.model';

describe('RegisterPageComponent', () => {
  let component: RegisterPageComponent;
  let fixture: ComponentFixture<RegisterPageComponent>;
  let router: Router;
  let mockAuthService: {
    register: ReturnType<typeof vi.fn>;
  };

  const mockResponse: AuthResponse = {
    token: 'new-token',
    user: {
      id: '2',
      name: 'Bob',
      email: 'bob@example.com',
      createdAt: '2026-01-01',
    },
  };

  beforeEach(async () => {
    mockAuthService = {
      register: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [RegisterPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(RegisterPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component with an invalid empty form', () => {
    expect(component).toBeTruthy();
    expect(component.form.valid).toBe(false);
  });

  it('should require a password of at least 8 characters', () => {
    component.form.controls.name.setValue('Bob');
    component.form.controls.email.setValue('bob@example.com');
    component.form.controls.password.setValue('short');

    expect(component.form.controls.password.hasError('minlength')).toBe(true);
    expect(component.form.valid).toBe(false);

    component.form.controls.password.setValue('ValidPass123');
    expect(component.form.controls.password.valid).toBe(true);
    expect(component.form.valid).toBe(true);
  });

  it('should not call auth.register when form is invalid', () => {
    component.submit();
    expect(mockAuthService.register).not.toHaveBeenCalled();
    expect(component.form.controls.name.touched).toBe(true);
    expect(component.form.controls.email.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
  });

  it('should call auth.register and navigate to /tracks upon successful registration', () => {
    mockAuthService.register.mockReturnValue(of(mockResponse));
    component.form.setValue({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'StrongPassword123',
    });

    component.submit();

    expect(mockAuthService.register).toHaveBeenCalledWith(
      'Bob',
      'bob@example.com',
      'StrongPassword123',
    );
    expect(component.submitting()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tracks');
  });

  it('should display friendly error when email is already taken (409 Conflict)', () => {
    const error409 = new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: { message: 'Email déjà utilisé' },
    });
    mockAuthService.register.mockReturnValue(throwError(() => error409));

    component.form.setValue({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'StrongPassword123',
    });

    component.submit();

    expect(component.submitting()).toBe(false);
    expect(component.error()).toBe('Cette adresse email est déjà utilisée par un autre compte.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('should prevent double submission', () => {
    mockAuthService.register.mockReturnValue(of(mockResponse));
    component.submitting.set(true);

    component.submit();

    expect(mockAuthService.register).not.toHaveBeenCalled();
  });
});

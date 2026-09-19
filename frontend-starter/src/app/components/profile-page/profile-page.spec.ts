import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { ProfilePageComponent } from './profile-page';
import { AuthService } from '../../shared/services/auth.service';
import { User } from '../../shared/models/user.model';

describe('ProfilePageComponent', () => {
  let component: ProfilePageComponent;
  let fixture: ComponentFixture<ProfilePageComponent>;
  let mockAuthService: {
    currentUser: ReturnType<typeof signal<User | null>>;
    profile: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  const initialUser: User = {
    id: 'user-456',
    name: 'Charlie',
    email: 'charlie@example.com',
    createdAt: '2026-01-15T10:00:00.000Z',
  };

  beforeEach(async () => {
    mockAuthService = {
      currentUser: signal<User | null>(initialUser),
      profile: vi.fn(),
      update: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize form with existing currentUser name on ngOnInit', () => {
    expect(component).toBeTruthy();
    expect(component.form.controls.name.value).toBe('Charlie');
    expect(component.isUnchanged()).toBe(true);
    expect(mockAuthService.profile).not.toHaveBeenCalled();
  });

  it('should call profile() on ngOnInit if currentUser is null', () => {
    mockAuthService.currentUser.set(null);
    mockAuthService.profile.mockReturnValue(of(initialUser));

    component.ngOnInit();

    expect(mockAuthService.profile).toHaveBeenCalled();
    expect(component.form.controls.name.value).toBe('Charlie');
  });

  it('should detect when name is changed vs unchanged', () => {
    expect(component.isUnchanged()).toBe(true);

    component.form.controls.name.setValue('Charlie New');
    expect(component.isUnchanged()).toBe(false);

    component.form.controls.name.setValue('Charlie');
    expect(component.isUnchanged()).toBe(true);
  });

  it('should not submit if form is invalid or unchanged', () => {
    component.form.controls.name.setValue('Charlie');
    component.save();
    expect(mockAuthService.update).not.toHaveBeenCalled();

    component.form.controls.name.setValue('C'); // minlength is 2
    component.save();
    expect(mockAuthService.update).not.toHaveBeenCalled();
  });

  it('should call auth.update with trimmed name and display success message', () => {
    const updatedUser = { ...initialUser, name: 'Charlie Dave' };
    mockAuthService.update.mockReturnValue(of(updatedUser));

    component.form.controls.name.setValue('  Charlie Dave  ');
    component.save();

    expect(mockAuthService.update).toHaveBeenCalledWith('Charlie Dave');
    expect(component.submitting()).toBe(false);
    expect(component.success()).toBe('Profil mis à jour avec succès !');
    expect(component.error()).toBe('');
  });

  it('should display error message on update failure', () => {
    const error500 = new HttpErrorResponse({
      status: 500,
      statusText: 'Internal Server Error',
      error: { message: 'Erreur serveur' },
    });
    mockAuthService.update.mockReturnValue(throwError(() => error500));

    component.form.controls.name.setValue('Charlie Dave');
    component.save();

    expect(component.submitting()).toBe(false);
    expect(component.error()).toBe('Erreur serveur');
    expect(component.success()).toBe('');
  });

  it('should prevent double submission while submitting', () => {
    mockAuthService.update.mockReturnValue(of(initialUser));
    component.form.controls.name.setValue('Charlie New');
    component.submitting.set(true);

    component.save();

    expect(mockAuthService.update).not.toHaveBeenCalled();
  });
});

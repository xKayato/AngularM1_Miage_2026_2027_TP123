import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { AppComponent } from './app';
import { AuthService } from '../../shared/services/auth.service';
import { ThemeService } from '../../shared/services/theme.service';
import { User } from '../../shared/models/user.model';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;

  let mockCurrentUser: ReturnType<typeof signal<User | null>>;
  let mockIsAuthenticated: ReturnType<typeof signal<boolean>>;
  let mockIsAdmin: ReturnType<typeof signal<boolean>>;
  let mockLogout: ReturnType<typeof vi.fn>;
  let mockInitSession: ReturnType<typeof vi.fn>;

  let mockThemeService: {
    isDark: ReturnType<typeof signal<boolean>>;
    toggleTheme: ReturnType<typeof vi.fn>;
    initTheme: ReturnType<typeof vi.fn>;
  };

  const sampleUserWithAvatar: User = {
    id: 'user-123',
    name: 'Alice Maker',
    email: 'alice@example.com',
    role: 'user',
    status: 'active',
    bio: 'Maker passionnée',
    profileTags: ['diy', 'arduino'],
    hasAvatar: true,
    avatarUrl: '/api/users/user-123/avatar',
    createdAt: '2026-02-01T12:00:00.000Z',
  };

  beforeEach(async () => {
    mockCurrentUser = signal<User | null>(null);
    mockIsAuthenticated = signal<boolean>(false);
    mockIsAdmin = signal<boolean>(false);
    mockLogout = vi.fn();
    mockInitSession = vi.fn();

    mockThemeService = {
      isDark: signal<boolean>(false),
      toggleTheme: vi.fn(),
      initTheme: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: mockCurrentUser,
            isAuthenticated: mockIsAuthenticated,
            isAdmin: mockIsAdmin,
            logout: mockLogout,
            initializeSession: mockInitSession,
          },
        },
        {
          provide: ThemeService,
          useValue: mockThemeService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component and initialize session', () => {
    expect(component).toBeTruthy();
    expect(mockInitSession).toHaveBeenCalled();
  });

  it('should render login and register links when not authenticated', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.nav-auth-login')).toBeTruthy();
    expect(compiled.querySelector('.nav-auth-register')).toBeTruthy();
    expect(compiled.querySelector('.user-profile-badge')).toBeNull();
  });

  it('should render initials circle when user is authenticated without avatar', () => {
    mockCurrentUser.set({
      ...sampleUserWithAvatar,
      hasAvatar: false,
      avatarUrl: null,
    });
    mockIsAuthenticated.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.user-profile-badge');
    expect(badge).toBeTruthy();

    const avatarImg = badge?.querySelector('.avatar-img');
    const avatarCircle = badge?.querySelector('.avatar-circle');

    expect(avatarImg).toBeNull();
    expect(avatarCircle).toBeTruthy();
    expect(avatarCircle?.textContent?.trim()).toBe('AM');
  });

  it('should render avatar img when user is authenticated with avatar', () => {
    mockCurrentUser.set(sampleUserWithAvatar);
    mockIsAuthenticated.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.user-profile-badge');
    expect(badge).toBeTruthy();

    const avatarImg = badge?.querySelector('.avatar-img') as HTMLImageElement;
    expect(avatarImg).toBeTruthy();
    expect(avatarImg.getAttribute('src')).toBe('/api/users/user-123/avatar');
    expect(badge?.querySelector('.avatar-circle')).toBeNull();
  });

  it('should fallback to initials circle if avatar image triggers error', () => {
    mockCurrentUser.set(sampleUserWithAvatar);
    mockIsAuthenticated.set(true);
    fixture.detectChanges();

    let compiled = fixture.nativeElement as HTMLElement;
    const avatarImg = compiled.querySelector('.avatar-img') as HTMLImageElement;
    expect(avatarImg).toBeTruthy();

    // Trigger error event
    avatarImg.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(component.avatarFailed()).toBe(true);
    compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.avatar-img')).toBeNull();
    const avatarCircle = compiled.querySelector('.avatar-circle');
    expect(avatarCircle).toBeTruthy();
    expect(avatarCircle?.textContent?.trim()).toBe('AM');
  });

  it('should toggle mobile menu', () => {
    expect(component.mobileMenuOpen()).toBe(false);
    component.toggleMobileMenu();
    expect(component.mobileMenuOpen()).toBe(true);
    component.toggleMobileMenu();
    expect(component.mobileMenuOpen()).toBe(false);
  });

  it('should call auth.logout when logout is invoked', () => {
    component.logout();
    expect(mockLogout).toHaveBeenCalled();
  });
});

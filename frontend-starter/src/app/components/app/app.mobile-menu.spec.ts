import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { AppComponent } from './app';
import { AuthService } from '../../shared/services/auth.service';
import { ThemeService } from '../../shared/services/theme.service';
import { User } from '../../shared/models/user.model';

/**
 * Sur téléphone (≤ 600 px), l'en-tête ne garde que le logo, le thème et le bouton ☰ :
 * Connexion, Inscription, Déconnexion et la navigation doivent donc être dans le menu mobile.
 */
describe('AppComponent — menu mobile', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let isAdmin: ReturnType<typeof signal<boolean>>;
  let currentUser: ReturnType<typeof signal<User | null>>;
  let logout: ReturnType<typeof vi.fn>;

  const user: User = {
    id: 'u-1',
    name: 'Alice Maker',
    email: 'alice@example.com',
    role: 'user',
    status: 'active',
    bio: '',
    profileTags: [],
    hasAvatar: false,
    avatarUrl: null,
    createdAt: '2026-02-01T12:00:00.000Z',
  };

  beforeEach(async () => {
    isAuthenticated = signal(false);
    isAdmin = signal(false);
    currentUser = signal<User | null>(null);
    logout = vi.fn();

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser, isAuthenticated, isAdmin, logout, initializeSession: vi.fn() },
        },
        { provide: ThemeService, useValue: { isDark: signal(true), toggleTheme: vi.fn(), initTheme: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const drawerLinks = (): string[] =>
    Array.from(el().querySelectorAll('.mobile-drawer .mobile-link')).map((a) => (a.textContent ?? '').trim());

  function openMenu(): void {
    el().querySelector<HTMLButtonElement>('.burger-btn')!.click();
    fixture.detectChanges();
  }

  it('le bouton ☰ est présent, accessible et fermé au départ', () => {
    const burger = el().querySelector('.burger-btn');
    expect(burger).not.toBeNull();
    expect(burger?.getAttribute('aria-label')).toBe('Menu de navigation mobile');
    expect(burger?.getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('.mobile-drawer')).toBeNull();
  });

  it('ouvre et referme le menu', () => {
    openMenu();
    expect(component.mobileMenuOpen()).toBe(true);
    expect(el().querySelector('.burger-btn')?.getAttribute('aria-expanded')).toBe('true');
    openMenu();
    expect(el().querySelector('.mobile-drawer')).toBeNull();
  });

  it('visiteur : le menu contient la navigation, Connexion et Inscription', () => {
    openMenu();
    const links = drawerLinks();
    expect(links).toContain('Catalogue des créations');
    expect(links).toContain('Recherche de créateurs');
    expect(links).toContain('Connexion');
    expect(links).toContain('Inscription');
  });

  it('connecté : le menu contient Mes créations, le profil et la déconnexion', () => {
    isAuthenticated.set(true);
    currentUser.set(user);
    fixture.detectChanges();
    openMenu();
    const links = drawerLinks();
    expect(links).toContain('Mes créations');
    expect(links.some((l) => l.includes('Alice Maker') || /profil/i.test(l))).toBe(true);
    expect(links.some((l) => /déconnexion/i.test(l))).toBe(true);
    expect(links).not.toContain('Connexion');
  });

  it('la déconnexion depuis le menu appelle logout et referme le menu', () => {
    isAuthenticated.set(true);
    currentUser.set(user);
    fixture.detectChanges();
    openMenu();
    el().querySelector<HTMLButtonElement>('.mobile-logout-btn')!.click();
    fixture.detectChanges();
    expect(logout).toHaveBeenCalled();
    expect(component.mobileMenuOpen()).toBe(false);
  });

  it('administrateur : le lien Administration est dans le menu', () => {
    isAuthenticated.set(true);
    isAdmin.set(true);
    currentUser.set({ ...user, role: 'admin' });
    fixture.detectChanges();
    openMenu();
    expect(drawerLinks()).toContain('Administration');
  });

  it('cliquer un lien du menu le referme', () => {
    // La navigation elle-même n'est pas testée ici (aucune route déclarée dans ce test)
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    openMenu();
    el().querySelector<HTMLAnchorElement>('.mobile-drawer a.mobile-link')!.click();
    fixture.detectChanges();
    expect(component.mobileMenuOpen()).toBe(false);
  });

  it('le libellé du thème est dans un élément à part (masqué sur téléphone, icône conservée)', () => {
    expect(el().querySelector('.theme-switch-btn .theme-icon')).not.toBeNull();
    expect(el().querySelector('.theme-switch-btn .theme-text')).not.toBeNull();
  });
});

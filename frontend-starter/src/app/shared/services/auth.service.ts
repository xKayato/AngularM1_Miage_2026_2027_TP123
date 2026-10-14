import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';
import { AuthStatus, LoginRequest, RegisterRequest, UpdateProfileRequest } from '../models/auth.models';

/**
 * Handles user authentication state, session persistence, and API calls.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenKey = 'gpc_token';

  readonly currentUser = signal<User | null>(null);
  readonly token = signal<string | null>(this.readStoredToken());
  readonly authStatus = signal<AuthStatus>(this.readStoredToken() ? 'loading' : 'anonymous');
  readonly isAuthenticated = computed(() => this.authStatus() === 'authenticated');
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  /**
   * Restores user session if a token exists in storage.
   */
  initializeSession(): void {
    const storedToken = this.token();
    if (!storedToken) {
      this.authStatus.set('anonymous');
      return;
    }

    this.authStatus.set('loading');
    this.profile().subscribe({
      next: () => {
        this.authStatus.set('authenticated');
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.clearSession();
        } else {
          this.authStatus.set('anonymous');
        }
      },
    });
  }

  /**
   * Logs in a user with email and password.
   */
  login(email: string, password: string): Observable<AuthResponse> {
    const payload: LoginRequest = {
      email: email.trim().toLowerCase(),
      password,
    };

    return this.http
      .post<AuthResponse>('/api/auth/login', payload)
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  /**
   * Registers a new user.
   */
  register(name: string, email: string, password: string): Observable<AuthResponse> {
    const payload: RegisterRequest = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    };

    return this.http
      .post<AuthResponse>('/api/auth/register', payload)
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  /**
   * Fetches the profile of the currently authenticated user.
   */
  profile(): Observable<User> {
    return this.http.get<User>('/api/users/me').pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.authStatus.set('authenticated');
      }),
    );
  }

  /**
   * Updates the current user's name (legacy method).
   */
  update(name: string): Observable<User> {
    return this.updateProfile({ name: name.trim() });
  }

  /**
   * Updates extended profile data (name, email, bio, profileTags).
   */
  updateProfile(data: { name?: string; email?: string; bio?: string; profileTags?: string[] }): Observable<User> {
    interface UpdateProfileResponse extends User {
      token?: string;
    }

    const payload: { name?: string; email?: string; bio?: string; profileTags?: string[] } = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.email !== undefined) payload.email = data.email.trim().toLowerCase();
    if (data.bio !== undefined) payload.bio = data.bio.trim();
    if (data.profileTags !== undefined) payload.profileTags = data.profileTags;

    return this.http.put<UpdateProfileResponse>('/api/users/me', payload).pipe(
      tap((res: UpdateProfileResponse) => {
        if (res.token) {
          this.storeToken(res.token);
          this.token.set(res.token);
        }
        this.currentUser.set(res);
      }),
    );
  }

  /**
   * Updates password with verification and stores new active session JWT.
   */
  updatePassword(
    currentPassword: string,
    newPassword: string,
  ): Observable<{ message: string; token: string; user: User }> {
    return this.http
      .put<{ message: string; token: string; user: User }>('/api/users/me/password', {
        currentPassword,
        newPassword,
      })
      .pipe(
        tap((res) => {
          if (res.token) {
            this.storeToken(res.token);
            this.token.set(res.token);
          }
          if (res.user) {
            this.currentUser.set(res.user);
          }
        }),
      );
  }

  /**
   * Uploads and sets user profile avatar image.
   */
  uploadAvatar(file: File): Observable<User> {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.http.post<User>('/api/users/me/avatar', formData).pipe(
      tap((user) => this.currentUser.set(user)),
    );
  }

  /**
   * Deletes user profile avatar.
   */
  deleteAvatar(): Observable<void> {
    return this.http.delete<void>('/api/users/me/avatar').pipe(
      tap(() => {
        this.currentUser.update((u) => (u ? { ...u, hasAvatar: false, avatarUrl: null } : null));
      }),
    );
  }

  /**
   * Cleans local state and stored token without performing routing.
   * Pure state cleanup (idempotent).
   */
  clearSession(): void {
    this.clearStoredToken();
    this.token.set(null);
    this.currentUser.set(null);
    this.authStatus.set('anonymous');
  }

  /**
   * Logs out user, cleans storage, and redirects to login page.
   */
  logout(): void {
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /**
   * Handles 401 unauthorized errors detected on protected routes.
   * Clears state and redirects to login if not already on /login or /register.
   */
  handleUnauthorized(): void {
    this.clearSession();
    const currentUrl = this.router.url;
    if (!currentUrl.includes('/login') && !currentUrl.includes('/register')) {
      void this.router.navigate(['/login']);
    }
  }

  private storeAuthentication(response: AuthResponse): void {
    this.storeToken(response.token);
    this.token.set(response.token);
    this.currentUser.set(response.user);
    this.authStatus.set('authenticated');
  }

  private readStoredToken(): string | null {
    try {
      const stored = localStorage.getItem(this.tokenKey);
      return stored && stored.trim().length > 0 ? stored.trim() : null;
    } catch {
      return null;
    }
  }

  private storeToken(token: string): void {
    try {
      localStorage.setItem(this.tokenKey, token);
    } catch {
      // Storage unavailable or disabled
    }
  }

  private clearStoredToken(): void {
    try {
      localStorage.removeItem(this.tokenKey);
    } catch {
      // Storage unavailable or disabled
    }
  }
}

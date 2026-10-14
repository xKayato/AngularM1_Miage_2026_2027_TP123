import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { ProfilePageComponent } from './profile-page';
import { AuthService } from '../../shared/services/auth.service';
import { PostService } from '../../shared/services/post.service';
import { CreatorService } from '../../shared/services/creator.service';
import { User } from '../../shared/models/user.model';
import { FollowItem, SubscriptionItem } from '../../shared/models/creator.model';

describe('ProfilePageComponent', () => {
  let component: ProfilePageComponent;
  let fixture: ComponentFixture<ProfilePageComponent>;

  let mockAuthService: {
    currentUser: ReturnType<typeof signal<User | null>>;
    profile: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  let mockPostService: {
    getMyPosts: ReturnType<typeof vi.fn>;
  };

  let mockCreatorService: {
    getMyFollows: ReturnType<typeof vi.fn>;
    getMySubscriptions: ReturnType<typeof vi.fn>;
    unfollow: ReturnType<typeof vi.fn>;
  };

  const initialUser: User = {
    id: 'user-456',
    name: 'Charlie',
    email: 'charlie@example.com',
    role: 'user',
    status: 'active',
    createdAt: '2026-01-15T10:00:00.000Z',
  };

  beforeEach(async () => {
    mockAuthService = {
      currentUser: signal<User | null>(initialUser),
      profile: vi.fn(),
      update: vi.fn(),
    };

    mockPostService = {
      getMyPosts: vi.fn().mockImplementation((params) => {
        let count = 10;
        if (params?.status === 'published') count = 6;
        if (params?.status === 'draft') count = 3;
        if (params?.status === 'archived') count = 1;
        return of({
          docs: [],
          items: [],
          totalDocs: count,
          total: count,
          page: 1,
          limit: 1,
          totalPages: count,
          pages: count,
          hasPrevPage: false,
          hasNextPage: count > 1,
        });
      }),
    };

    mockCreatorService = {
      getMyFollows: vi.fn().mockReturnValue(
        of({
          docs: [
            {
              id: 'f-1',
              creator: { id: 'c-1', name: 'Alice Briquiste' },
              createdAt: '2026-02-01T10:00:00.000Z',
            } as FollowItem,
          ],
          totalDocs: 1,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          pages: 1,
        }),
      ),
      getMySubscriptions: vi.fn().mockReturnValue(
        of({
          docs: [
            {
              id: 's-1',
              creator: { id: 'c-2', name: 'Bastien Papercrafter' },
              active: true,
              expiresAt: '2026-11-20T12:00:00.000Z',
              createdAt: '2026-10-20T12:00:00.000Z',
            } as SubscriptionItem,
          ],
          totalDocs: 1,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          pages: 1,
        }),
      ),
      unfollow: vi.fn().mockReturnValue(of({ following: false })),
    };

    await TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: PostService, useValue: mockPostService },
        { provide: CreatorService, useValue: mockCreatorService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // --- Tests existants préservés ---

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

  // --- Nouveaux tests Mission III (Dashboard, Metrics, Follows & Subscriptions) ---

  it('should load lightweight creation metrics on init without downloading all posts', () => {
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'all' });
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'published' });
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'draft' });
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'archived' });

    expect(component.totalPostsCount()).toBe(10);
    expect(component.publishedPostsCount()).toBe(6);
    expect(component.draftsPostsCount()).toBe(3);
    expect(component.archivedPostsCount()).toBe(1);
    expect(component.loadingMetrics()).toBe(false);
  });

  it('should handle metrics error gracefully without crashing dashboard', () => {
    mockPostService.getMyPosts.mockReturnValue(throwError(() => new Error('Network error')));
    component.loadMetrics();

    expect(component.loadingMetrics()).toBe(false);
    expect(component.metricsError()).toBe('Impossible de charger les métriques de créations.');
  });

  it('should load followed creators and active subscriptions on init', () => {
    expect(mockCreatorService.getMyFollows).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(mockCreatorService.getMySubscriptions).toHaveBeenCalledWith({ page: 1, limit: 20 });

    expect(component.totalFollows()).toBe(1);
    expect(component.follows().length).toBe(1);
    expect(component.follows()[0].creator.name).toBe('Alice Briquiste');

    expect(component.totalSubscriptions()).toBe(1);
    expect(component.subscriptions().length).toBe(1);
    expect(component.subscriptions()[0].creator.name).toBe('Bastien Papercrafter');
    expect(component.subscriptions()[0].active).toBe(true);
  });

  it('should unfollow creator and update follows list and counter', () => {
    component.unfollow('c-1');

    expect(mockCreatorService.unfollow).toHaveBeenCalledWith('c-1');
    expect(component.follows().length).toBe(0);
    expect(component.totalFollows()).toBe(0);
    expect(component.unfollowingId()).toBe(null);
  });

  it('should render metric badges and creators list in template DOM', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    // Métriques
    expect(compiled.querySelector('.metrics-grid')).toBeTruthy();
    expect(compiled.textContent).toContain('Total projets');
    expect(compiled.textContent).toContain('Publiés');

    // Follows
    expect(compiled.textContent).toContain('Alice Briquiste');
    expect(compiled.textContent).toContain('Ne plus suivre');

    // Subscriptions
    expect(compiled.textContent).toContain('Bastien Papercrafter');
    expect(compiled.textContent).toContain('Accès exclusif');
  });
});

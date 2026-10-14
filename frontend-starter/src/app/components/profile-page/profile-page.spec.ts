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
    updateProfile: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
    uploadAvatar: ReturnType<typeof vi.fn>;
    deleteAvatar: ReturnType<typeof vi.fn>;
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
    bio: 'Ma bio créative',
    profileTags: ['lego', 'papercraft'],
    hasAvatar: false,
    avatarUrl: null,
    createdAt: '2026-01-15T10:00:00.000Z',
  };

  beforeEach(async () => {
    mockAuthService = {
      currentUser: signal<User | null>(initialUser),
      profile: vi.fn(),
      update: vi.fn(),
      updateProfile: vi.fn(),
      updatePassword: vi.fn(),
      uploadAvatar: vi.fn(),
      deleteAvatar: vi.fn(),
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

  it('should initialize form with existing currentUser profile on ngOnInit', () => {
    expect(component).toBeTruthy();
    expect(component.form.controls.name.value).toBe('Charlie');
    expect(component.form.controls.email.value).toBe('charlie@example.com');
    expect(component.form.controls.bio.value).toBe('Ma bio créative');
    expect(component.form.controls.profileTags.value).toBe('lego, papercraft');
    expect(component.isUnchanged()).toBe(true);
  });

  it('should call profile() on ngOnInit if currentUser is null', () => {
    mockAuthService.currentUser.set(null);
    mockAuthService.profile.mockReturnValue(of(initialUser));

    component.ngOnInit();

    expect(mockAuthService.profile).toHaveBeenCalled();
    expect(component.form.controls.name.value).toBe('Charlie');
  });

  it('should detect when form is changed vs unchanged', () => {
    expect(component.isUnchanged()).toBe(true);

    component.form.controls.bio.setValue('Nouvelle biographie');
    expect(component.isUnchanged()).toBe(false);

    component.form.controls.bio.setValue('Ma bio créative');
    expect(component.isUnchanged()).toBe(true);
  });

  it('should call auth.updateProfile with parsed data and display success message', () => {
    const updatedUser: User = {
      ...initialUser,
      name: 'Charlie Dave',
      bio: 'Bio mise à jour',
      profileTags: ['bois', 'diy'],
    };
    mockAuthService.updateProfile.mockReturnValue(of(updatedUser));

    component.form.controls.name.setValue('Charlie Dave');
    component.form.controls.bio.setValue('Bio mise à jour');
    component.form.controls.profileTags.setValue('bois, diy');

    component.save();

    expect(mockAuthService.updateProfile).toHaveBeenCalledWith({
      name: 'Charlie Dave',
      email: 'charlie@example.com',
      bio: 'Bio mise à jour',
      profileTags: ['bois', 'diy'],
    });
    expect(component.submitting()).toBe(false);
    expect(component.success()).toBe('Profil mis à jour avec succès !');
  });

  it('should handle profile update error gracefully', () => {
    const err = new HttpErrorResponse({ status: 400, error: { message: 'Nom invalide' } });
    mockAuthService.updateProfile.mockReturnValue(throwError(() => err));

    component.form.controls.name.setValue('C');
    component.save();

    // Since minlength is 2, form is invalid and won't call service
    expect(mockAuthService.updateProfile).not.toHaveBeenCalled();

    component.form.controls.name.setValue('Valid Name');
    component.save();
    expect(component.error()).toBe('Nom invalide');
  });

  it('should validate and submit password change, showing success message', () => {
    mockAuthService.updatePassword.mockReturnValue(
      of({ message: 'Success', token: 'new-token', user: initialUser })
    );

    component.passwordForm.controls.currentPassword.setValue('oldSecret123');
    component.passwordForm.controls.newPassword.setValue('newSecret456');
    component.passwordForm.controls.confirmPassword.setValue('newSecret456');

    component.savePassword();

    expect(mockAuthService.updatePassword).toHaveBeenCalledWith('oldSecret123', 'newSecret456');
    expect(component.passwordSuccess()).toContain('Toutes vos autres sessions ont été invalidées');
    expect(component.passwordError()).toBe('');
  });

  it('should reject password update if confirmation does not match', () => {
    component.passwordForm.controls.currentPassword.setValue('oldSecret123');
    component.passwordForm.controls.newPassword.setValue('newSecret456');
    component.passwordForm.controls.confirmPassword.setValue('differentPassword');

    component.savePassword();

    expect(mockAuthService.updatePassword).not.toHaveBeenCalled();
    expect(component.passwordError()).toBe('Les deux nouveaux mots de passe ne correspondent pas.');
  });

  it('should display error when updatePassword returns 400 (without logging out)', () => {
    const err400 = new HttpErrorResponse({
      status: 400,
      error: { message: 'Mot de passe actuel incorrect' },
    });
    mockAuthService.updatePassword.mockReturnValue(throwError(() => err400));

    component.passwordForm.controls.currentPassword.setValue('wrongOldPass');
    component.passwordForm.controls.newPassword.setValue('newSecret456');
    component.passwordForm.controls.confirmPassword.setValue('newSecret456');

    component.savePassword();

    expect(component.passwordError()).toBe('Mot de passe actuel incorrect');
    expect(component.passwordSuccess()).toBe('');
  });

  it('should upload avatar and update avatar success signal', () => {
    const updatedUser = { ...initialUser, hasAvatar: true, avatarUrl: '/api/users/user-456/avatar' };
    mockAuthService.uploadAvatar.mockReturnValue(of(updatedUser));

    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' });
    const event = {
      target: {
        files: [file],
        value: '',
      },
    } as unknown as Event;

    component.onAvatarFileSelected(event);

    expect(mockAuthService.uploadAvatar).toHaveBeenCalledWith(file);
    expect(component.avatarSuccess()).toBe('Avatar mis à jour avec succès !');
  });

  it('should delete avatar and update avatar success signal', () => {
    mockAuthService.deleteAvatar.mockReturnValue(of(undefined));

    component.deleteAvatar();

    expect(mockAuthService.deleteAvatar).toHaveBeenCalled();
    expect(component.avatarSuccess()).toBe('Avatar supprimé avec succès.');
  });

  it('should load lightweight creation metrics on init without downloading all posts', () => {
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'all' });
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'published' });
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'draft' });
    expect(mockPostService.getMyPosts).toHaveBeenCalledWith({ page: 1, limit: 1, status: 'archived' });

    expect(component.totalPostsCount()).toBe(10);
    expect(component.publishedPostsCount()).toBe(6);
    expect(component.draftsPostsCount()).toBe(3);
    expect(component.archivedPostsCount()).toBe(1);
  });

  it('should load followed creators and active subscriptions on init', () => {
    expect(mockCreatorService.getMyFollows).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(mockCreatorService.getMySubscriptions).toHaveBeenCalledWith({ page: 1, limit: 20 });

    expect(component.totalFollows()).toBe(1);
    expect(component.totalSubscriptions()).toBe(1);
  });

  it('should unfollow creator and update follows list and counter', () => {
    component.unfollow('c-1');

    expect(mockCreatorService.unfollow).toHaveBeenCalledWith('c-1');
    expect(component.follows().length).toBe(0);
    expect(component.totalFollows()).toBe(0);
  });
});

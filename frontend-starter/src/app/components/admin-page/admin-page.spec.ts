import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { AdminPageComponent } from './admin-page';
import { AdminService } from '../../shared/services/admin.service';
import { AuthService } from '../../shared/services/auth.service';
import { PostAuthorManagement } from '../../shared/models/post.model';
import { User } from '../../shared/models/user.model';
import { signal } from '@angular/core';

describe('AdminPageComponent', () => {
  let component: AdminPageComponent;
  let fixture: ComponentFixture<AdminPageComponent>;
  let adminServiceMock: {
    getPost: ReturnType<typeof vi.fn>;
    archivePost: ReturnType<typeof vi.fn>;
    restorePost: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    suspendUser: ReturnType<typeof vi.fn>;
    reactivateUser: ReturnType<typeof vi.fn>;
  };
  let authServiceMock: {
    currentUser: ReturnType<typeof signal<User | null>>;
    isAdmin: ReturnType<typeof vi.fn>;
  };

  const adminUser: User = {
    id: 'admin-123',
    name: 'Admin Global',
    email: 'admin@makershare.test',
    role: 'admin',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const targetUser: User = {
    id: 'user-456',
    name: 'Créateur Test',
    email: 'creator@test.com',
    role: 'user',
    status: 'active',
    createdAt: '2026-02-01T00:00:00.000Z',
  };

  const mockPost: PostAuthorManagement = {
    id: 'post-789',
    author: { id: 'user-456', name: 'Créateur Test' },
    title: 'Post à modérer',
    shortDescription: 'Description de test pour l\'inspection modératrice',
    content: 'Contenu complet...',
    category: 'Lego',
    tags: ['test', 'mod'],
    visibility: 'public',
    status: 'published',
    likesCount: 5,
    commentsCount: 2,
    attachments: [],
    userInteractions: {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    },
    publishedAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    adminServiceMock = {
      getPost: vi.fn(),
      archivePost: vi.fn(),
      restorePost: vi.fn(),
      getUser: vi.fn(),
      suspendUser: vi.fn(),
      reactivateUser: vi.fn(),
    };

    authServiceMock = {
      currentUser: signal(adminUser),
      isAdmin: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [AdminPageComponent],
      providers: [
        { provide: AdminService, useValue: adminServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('s\'initialise correctement avec des états par défaut vides', () => {
    expect(component).toBeTruthy();
    expect(component.inspectedPost()).toBeNull();
    expect(component.inspectedUser()).toBeNull();
    expect(component.postLoading()).toBe(false);
    expect(component.userLoading()).toBe(false);
  });

  describe('Modération des posts', () => {
    it('affiche une erreur si aucun identifiant de post n\'est saisi', () => {
      component.searchPostId.set('   ');
      component.inspectPost();

      expect(component.postError()).toBe('Veuillez saisir un identifiant de post.');
      expect(adminServiceMock.getPost).not.toHaveBeenCalled();
    });

    it('inspecte un post avec succès et met à jour l\'état', () => {
      adminServiceMock.getPost.mockReturnValue(of(mockPost));
      component.searchPostId.set('post-789');

      component.inspectPost();

      expect(adminServiceMock.getPost).toHaveBeenCalledWith('post-789');
      expect(component.inspectedPost()).toEqual(mockPost);
      expect(component.postLoading()).toBe(false);
      expect(component.postError()).toBeNull();
    });

    it('gère l\'erreur 404 lors de l\'inspection d\'un post introuvable', () => {
      const errorResponse = new HttpErrorResponse({
        error: { message: 'Post introuvable' },
        status: 404,
      });
      adminServiceMock.getPost.mockReturnValue(throwError(() => errorResponse));
      component.searchPostId.set('inconnu');

      component.inspectPost();

      expect(component.inspectedPost()).toBeNull();
      expect(component.postLoading()).toBe(false);
      expect(component.postError()).toBe('Post introuvable');
    });

    it('gère le flux complet d\'archivage avec confirmation et succès', () => {
      component.inspectedPost.set(mockPost);
      expect(component.showArchiveConfirm()).toBe(false);

      // 1. Demande de confirmation
      component.promptArchive();
      expect(component.showArchiveConfirm()).toBe(true);

      // 2. Annulation
      component.cancelArchive();
      expect(component.showArchiveConfirm()).toBe(false);

      // 3. Demande à nouveau et exécution
      component.promptArchive();
      component.archiveReason.set('Spam avéré');

      const archivedPost: PostAuthorManagement = {
        ...mockPost,
        status: 'archived',
        archivedAt: '2026-03-02T00:00:00.000Z',
        archiveReason: 'Spam avéré',
      };
      adminServiceMock.archivePost.mockReturnValue(of(archivedPost));

      component.executeArchive();

      expect(adminServiceMock.archivePost).toHaveBeenCalledWith('post-789', 'Spam avéré');
      expect(component.inspectedPost()?.status).toBe('archived');
      expect(component.showArchiveConfirm()).toBe(false);
      expect(component.postSuccess()).toContain('archivé avec succès');
    });

    it('gère le flux complet de restauration avec confirmation et succès', () => {
      const archivedPost: PostAuthorManagement = {
        ...mockPost,
        status: 'archived',
        archivedAt: '2026-03-02T00:00:00.000Z',
        archiveReason: 'Signalement',
      };
      component.inspectedPost.set(archivedPost);

      component.promptRestore();
      expect(component.showRestoreConfirm()).toBe(true);

      const restoredPost: PostAuthorManagement = {
        ...mockPost,
        status: 'published',
        archivedAt: null,
        archiveReason: null,
      };
      adminServiceMock.restorePost.mockReturnValue(of(restoredPost));

      component.executeRestore();

      expect(adminServiceMock.restorePost).toHaveBeenCalledWith('post-789');
      expect(component.inspectedPost()?.status).toBe('published');
      expect(component.showRestoreConfirm()).toBe(false);
      expect(component.postSuccess()).toContain('restauré avec succès');
    });

    it('affiche une erreur si l\'appel d\'archivage échoue', () => {
      component.inspectedPost.set(mockPost);
      const errorResponse = new HttpErrorResponse({
        error: { message: 'Erreur serveur lors de l\'archivage' },
        status: 500,
      });
      adminServiceMock.archivePost.mockReturnValue(throwError(() => errorResponse));

      component.executeArchive();

      expect(component.postLoading()).toBe(false);
      expect(component.postError()).toBe('Erreur serveur lors de l\'archivage');
    });
  });

  describe('Modération des utilisateurs', () => {
    it('affiche une erreur si aucun identifiant/email n\'est saisi', () => {
      component.searchUserId.set('');
      component.inspectUser();

      expect(component.userError()).toBe('Veuillez saisir un identifiant ObjectId ou un email.');
      expect(adminServiceMock.getUser).not.toHaveBeenCalled();
    });

    it('inspecte un utilisateur avec succès', () => {
      adminServiceMock.getUser.mockReturnValue(of(targetUser));
      component.searchUserId.set('creator@test.com');

      component.inspectUser();

      expect(adminServiceMock.getUser).toHaveBeenCalledWith('creator@test.com');
      expect(component.inspectedUser()).toEqual(targetUser);
      expect(component.userLoading()).toBe(false);
    });

    it('interdit l\'auto-suspension d\'un administrateur dans l\'interface', () => {
      component.inspectedUser.set(adminUser); // l'admin connecté lui-même

      component.promptSuspend();

      expect(component.showSuspendConfirm()).toBe(false);
      expect(component.userError()).toContain('ne peut pas suspendre son propre compte');
    });

    it('gère le flux de suspension d\'un tiers avec confirmation et succès', () => {
      component.inspectedUser.set(targetUser);

      // Demande confirmation
      component.promptSuspend();
      expect(component.showSuspendConfirm()).toBe(true);

      // Annulation
      component.cancelSuspend();
      expect(component.showSuspendConfirm()).toBe(false);

      // Exécution
      component.promptSuspend();
      const suspendedUser: User = { ...targetUser, status: 'suspended' };
      adminServiceMock.suspendUser.mockReturnValue(of(suspendedUser));

      component.executeSuspend();

      expect(adminServiceMock.suspendUser).toHaveBeenCalledWith('user-456');
      expect(component.inspectedUser()?.status).toBe('suspended');
      expect(component.showSuspendConfirm()).toBe(false);
      expect(component.userSuccess()).toContain('a été suspendu');
    });

    it('gère le flux de réactivation avec confirmation et succès', () => {
      const suspendedUser: User = { ...targetUser, status: 'suspended' };
      component.inspectedUser.set(suspendedUser);

      component.promptReactivate();
      expect(component.showReactivateConfirm()).toBe(true);

      const reactivatedUser: User = { ...targetUser, status: 'active' };
      adminServiceMock.reactivateUser.mockReturnValue(of(reactivatedUser));

      component.executeReactivate();

      expect(adminServiceMock.reactivateUser).toHaveBeenCalledWith('user-456');
      expect(component.inspectedUser()?.status).toBe('active');
      expect(component.showReactivateConfirm()).toBe(false);
      expect(component.userSuccess()).toContain('a été réactivé');
    });
  });
});

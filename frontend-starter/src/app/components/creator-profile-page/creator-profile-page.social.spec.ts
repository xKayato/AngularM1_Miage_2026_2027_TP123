import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { CreatorProfilePageComponent } from './creator-profile-page';
import { CreatorService } from '../../shared/services/creator.service';
import { AuthService } from '../../shared/services/auth.service';
import { CreatorPublicProfile, FollowItem } from '../../shared/models/creator.model';
import { PostPreview } from '../../shared/models/post.model';
import { Page } from '../../shared/models/page.model';

function makePage<T>(docs: T[], extra: Partial<Page<T>> = {}): Page<T> {
  return {
    items: docs,
    docs,
    page: 1,
    limit: 12,
    total: docs.length,
    totalDocs: docs.length,
    pages: 1,
    totalPages: 1,
    ...extra,
  };
}

function makeCreation(i: number): PostPreview {
  return {
    id: `post-${i}`,
    title: `Création ${i}`,
    shortDescription: 'Description courte',
    category: 'Lego',
    tags: ['lego'],
    visibility: 'public',
    likesCount: 0,
    commentsCount: 0,
    attachmentsCount: 0,
    hasAudio: false,
    coverUrl: null,
    publishedAt: '2026-09-01T12:00:00.000Z',
    isLocked: false,
    author: { id: 'creator-1', name: 'Elena' },
  };
}

function makeProfile(id: string, creations: number): CreatorPublicProfile {
  return {
    id,
    name: `Créateur ${id}`,
    bio: 'Bio',
    profileTags: [],
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    followersCount: 3,
    followingCount: 2,
    subscribersCount: 0,
    creationsCount: creations,
    isSelf: false,
    userInteractions: { isFollowing: false, isSubscribed: false, subscriptionExpiresAt: null },
    creations: Array.from({ length: creations }, (_, i) => makeCreation(i + 1)),
  };
}

const followerItem: FollowItem = {
  id: 'f-1',
  creator: { id: 'u-9', name: 'Fan Numéro Un', bio: '', hasAvatar: false, avatarUrl: null },
  createdAt: '2026-10-01T10:00:00.000Z',
};

describe('CreatorProfilePageComponent — followers / suivis et pagination des créations', () => {
  let fixture: ComponentFixture<CreatorProfilePageComponent>;
  let component: CreatorProfilePageComponent;
  let paramMap$: BehaviorSubject<ParamMap>;
  let creatorServiceMock: {
    getCreatorProfile: ReturnType<typeof vi.fn>;
    getCreatorFollowers: ReturnType<typeof vi.fn>;
    getCreatorFollowing: ReturnType<typeof vi.fn>;
    follow: ReturnType<typeof vi.fn>;
    unfollow: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject<ParamMap>(convertToParamMap({ id: 'creator-1' }));
    creatorServiceMock = {
      getCreatorProfile: vi.fn().mockImplementation((id: string) => of(makeProfile(id, 14))),
      getCreatorFollowers: vi
        .fn()
        .mockReturnValue(of(makePage([followerItem], { totalPages: 3, pages: 3, totalDocs: 30, total: 30 }))),
      getCreatorFollowing: vi.fn().mockReturnValue(of(makePage<FollowItem>([]))),
      follow: vi.fn().mockReturnValue(of({ following: true })),
      unfollow: vi.fn().mockReturnValue(of({ following: false })),
      subscribe: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CreatorProfilePageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$.asObservable() } },
        { provide: CreatorService, useValue: creatorServiceMock },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: vi.fn().mockReturnValue(true),
            currentUser: vi.fn().mockReturnValue({ id: 'visitor', name: 'Visitor' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatorProfilePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('onglets sociaux', () => {
    it('ouvre l onglet followers et charge la page 1 avec limit 12', () => {
      component.toggleSocialTab('followers');
      expect(component.activeSocialTab()).toBe('followers');
      expect(creatorServiceMock.getCreatorFollowers).toHaveBeenCalledWith('creator-1', { page: 1, limit: 12 });
      expect(component.socialItems()).toEqual([followerItem]);
      expect(component.socialTotalPages()).toBe(3);
      expect(component.socialTotalDocs()).toBe(30);
      expect(component.socialLoading()).toBe(false);
    });

    it('ouvre l onglet suivis via getCreatorFollowing', () => {
      component.toggleSocialTab('following');
      expect(creatorServiceMock.getCreatorFollowing).toHaveBeenCalledWith('creator-1', { page: 1, limit: 12 });
      expect(creatorServiceMock.getCreatorFollowers).not.toHaveBeenCalled();
      expect(component.socialItems()).toEqual([]);
    });

    it('un second clic sur le même onglet le ferme sans recharger', () => {
      component.toggleSocialTab('followers');
      component.toggleSocialTab('followers');
      expect(component.activeSocialTab()).toBeNull();
      expect(creatorServiceMock.getCreatorFollowers).toHaveBeenCalledTimes(1);
    });

    it('passer de followers à suivis recharge la bonne liste', () => {
      component.toggleSocialTab('followers');
      component.toggleSocialTab('following');
      expect(component.activeSocialTab()).toBe('following');
      expect(component.socialItems()).toEqual([]);
    });

    it('closeSocialTab ferme le panneau', () => {
      component.toggleSocialTab('followers');
      component.closeSocialTab();
      expect(component.activeSocialTab()).toBeNull();
    });

    it('affiche le message serveur en cas d erreur', () => {
      creatorServiceMock.getCreatorFollowers.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Créateur introuvable ou inactif' } })),
      );
      component.toggleSocialTab('followers');
      expect(component.socialError()).toBe('Créateur introuvable ou inactif');
      expect(component.socialLoading()).toBe(false);
    });

    it('message par défaut si l erreur n a pas de message', () => {
      creatorServiceMock.getCreatorFollowing.mockReturnValueOnce(throwError(() => ({})));
      component.toggleSocialTab('following');
      expect(component.socialError()).toBe('Impossible de charger cette liste.');
    });

    it('goToSocialPage charge une page valide et ignore les autres', () => {
      component.toggleSocialTab('followers');
      creatorServiceMock.getCreatorFollowers.mockClear();
      component.goToSocialPage(0);
      component.goToSocialPage(4);
      component.goToSocialPage(1);
      expect(creatorServiceMock.getCreatorFollowers).not.toHaveBeenCalled();
      component.goToSocialPage(2);
      expect(creatorServiceMock.getCreatorFollowers).toHaveBeenCalledWith('creator-1', { page: 2, limit: 12 });
    });

    it('goToSocialPage ne fait rien si aucun onglet n est ouvert', () => {
      component.goToSocialPage(2);
      expect(creatorServiceMock.getCreatorFollowers).not.toHaveBeenCalled();
      expect(creatorServiceMock.getCreatorFollowing).not.toHaveBeenCalled();
    });

    it('les compteurs Followers et Suivis sont affichés', () => {
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toMatch(/Followers/i);
      expect(text).toMatch(/Suivi/i);
    });
  });

  describe('changement de créateur dans l URL', () => {
    it('recharge le profil et réinitialise onglet, liste et page', () => {
      component.toggleSocialTab('followers');
      component.goToCreationsPage(2);

      paramMap$.next(convertToParamMap({ id: 'creator-2' }));

      expect(creatorServiceMock.getCreatorProfile).toHaveBeenLastCalledWith('creator-2');
      expect(component.activeSocialTab()).toBeNull();
      expect(component.socialItems()).toEqual([]);
      expect(component.creationsPage()).toBe(1);
      expect(component.profile()?.id).toBe('creator-2');
    });

    it('identifiant manquant : message d erreur', () => {
      paramMap$.next(convertToParamMap({}));
      expect(component.error()).toBe('Identifiant créateur manquant.');
      expect(component.loading()).toBe(false);
    });
  });

  describe('pagination locale des créations', () => {
    it('6 créations par page par défaut', () => {
      expect(component.creationsPageSize()).toBe(6);
      expect(component.creationsTotalPages()).toBe(3);
      expect(component.paginatedCreations().map((p) => p.id)).toEqual([
        'post-1', 'post-2', 'post-3', 'post-4', 'post-5', 'post-6',
      ]);
    });

    it('la dernière page contient le reste', () => {
      component.goToCreationsPage(3);
      expect(component.paginatedCreations().map((p) => p.id)).toEqual(['post-13', 'post-14']);
    });

    it('ignore les pages hors bornes', () => {
      component.goToCreationsPage(0);
      component.goToCreationsPage(4);
      expect(component.creationsPage()).toBe(1);
    });

    it('changer la taille revient à la page 1', () => {
      component.goToCreationsPage(2);
      component.setCreationsPageSize(12);
      expect(component.creationsPage()).toBe(1);
      expect(component.creationsTotalPages()).toBe(2);
      expect(component.paginatedCreations().length).toBe(12);
    });

    it('même taille : page conservée', () => {
      component.goToCreationsPage(2);
      component.setCreationsPageSize(6);
      expect(component.creationsPage()).toBe(2);
    });

    it('profil sans création : 1 page et liste vide', () => {
      creatorServiceMock.getCreatorProfile.mockReturnValueOnce(of(makeProfile('creator-3', 0)));
      paramMap$.next(convertToParamMap({ id: 'creator-3' }));
      expect(component.creationsTotalPages()).toBe(1);
      expect(component.paginatedCreations()).toEqual([]);
    });
  });
});

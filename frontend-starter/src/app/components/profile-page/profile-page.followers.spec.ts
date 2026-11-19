import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { ProfilePageComponent } from './profile-page';
import { AuthService } from '../../shared/services/auth.service';
import { PostService } from '../../shared/services/post.service';
import { CreatorService } from '../../shared/services/creator.service';
import { User } from '../../shared/models/user.model';
import { FollowItem } from '../../shared/models/creator.model';
import { Page } from '../../shared/models/page.model';

function makePage<T>(docs: T[], total = docs.length): Page<T> {
  return { items: docs, docs, page: 1, limit: 20, total, totalDocs: total, pages: 1, totalPages: 1 };
}

const me: User = {
  id: 'me-1',
  name: 'Charlie',
  email: 'charlie@example.com',
  role: 'user',
  status: 'active',
  bio: '',
  profileTags: [],
  hasAvatar: false,
  avatarUrl: null,
  createdAt: '2026-01-15T10:00:00.000Z',
};

const follower: FollowItem = {
  id: 'f-1',
  creator: { id: 'fan-1', name: 'Fan Fidèle' },
  createdAt: '2026-10-01T10:00:00.000Z',
};

const followed: FollowItem = {
  id: 'f-2',
  creator: { id: 'c-1', name: 'Alice Briquiste' },
  createdAt: '2026-02-01T10:00:00.000Z',
};

describe('ProfilePageComponent — section Mes Followers et liens Projets', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let component: ProfilePageComponent;
  let currentUser: ReturnType<typeof signal<User | null>>;
  let creatorServiceMock: {
    getMyFollows: ReturnType<typeof vi.fn>;
    getMySubscriptions: ReturnType<typeof vi.fn>;
    getCreatorFollowers: ReturnType<typeof vi.fn>;
    unfollow: ReturnType<typeof vi.fn>;
  };
  let authMock: { currentUser: typeof currentUser; profile: ReturnType<typeof vi.fn> };

  async function setup(user: User | null): Promise<void> {
    currentUser = signal<User | null>(user);
    authMock = { currentUser, profile: vi.fn().mockReturnValue(of(me)) };
    creatorServiceMock = {
      getMyFollows: vi.fn().mockReturnValue(of(makePage([followed]))),
      getMySubscriptions: vi.fn().mockReturnValue(of(makePage([]))),
      getCreatorFollowers: vi.fn().mockReturnValue(of(makePage([follower], 7))),
      unfollow: vi.fn().mockReturnValue(of({ following: false })),
    };

    await TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        {
          provide: PostService,
          useValue: { getMyPosts: vi.fn().mockReturnValue(of(makePage([]))) },
        },
        { provide: CreatorService, useValue: creatorServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('utilisateur déjà connu', () => {
    beforeEach(async () => {
      await setup(me);
    });

    it('charge mes followers avec mon ID, page 1, limit 20', () => {
      expect(creatorServiceMock.getCreatorFollowers).toHaveBeenCalledWith('me-1', { page: 1, limit: 20 });
      expect(component.myFollowers()).toEqual([follower]);
      expect(component.totalMyFollowers()).toBe(7);
      expect(component.loadingMyFollowers()).toBe(false);
    });

    it('un seul appel au chargement initial', () => {
      expect(creatorServiceMock.getCreatorFollowers).toHaveBeenCalledTimes(1);
    });

    it('affiche la section Mes Followers avec le nom du follower', () => {
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Mes Followers');
      expect(text).toContain('Fan Fidèle');
    });

    it('les liens Projets filtrent le catalogue par ID d auteur (et non plus par texte)', () => {
      const links = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.btn-link'),
      ).filter((a) => a.textContent?.trim() === 'Projets');
      expect(links.length).toBeGreaterThanOrEqual(2);
      const hrefs = links.map((a) => a.getAttribute('href') ?? '');
      expect(hrefs.some((h) => h.includes('author=c-1'))).toBe(true);
      expect(hrefs.some((h) => h.includes('author=fan-1'))).toBe(true);
      expect(hrefs.every((h) => !h.includes('query='))).toBe(true);
    });

    it('erreur : message dédié et état de chargement levé', () => {
      creatorServiceMock.getCreatorFollowers.mockReturnValueOnce(throwError(() => new Error('500')));
      component.loadMyFollowers();
      expect(component.myFollowersError()).toBe('Impossible de charger vos followers.');
      expect(component.loadingMyFollowers()).toBe(false);
    });

    it('état vide : message dédié', () => {
      creatorServiceMock.getCreatorFollowers.mockReturnValueOnce(of(makePage<FollowItem>([])));
      component.loadMyFollowers();
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Aucun utilisateur ne vous suit pour le moment.');
      expect(component.totalMyFollowers()).toBe(0);
    });

    it('loadDashboardData recharge aussi les followers', () => {
      creatorServiceMock.getCreatorFollowers.mockClear();
      component.loadDashboardData();
      expect(creatorServiceMock.getCreatorFollowers).toHaveBeenCalledTimes(1);
    });
  });

  describe('utilisateur pas encore chargé', () => {
    it('ne demande les followers qu après la récupération du profil', async () => {
      await setup(null);
      // Sans ID connu, aucune requête prématurée vers /api/creators/undefined/followers
      const ids = creatorServiceMock.getCreatorFollowers.mock.calls.map((c) => c[0]);
      expect(ids).not.toContain(undefined);
      expect(authMock.profile).toHaveBeenCalled();
    });
  });
});

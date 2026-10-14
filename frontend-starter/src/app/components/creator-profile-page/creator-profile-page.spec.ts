import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { CreatorProfilePageComponent } from './creator-profile-page';
import { CreatorService } from '../../shared/services/creator.service';
import { AuthService } from '../../shared/services/auth.service';
import { CreatorPublicProfile } from '../../shared/models/creator.model';

describe('CreatorProfilePageComponent (Mission 1 — Profil Public Créateur)', () => {
  let component: CreatorProfilePageComponent;
  let fixture: ComponentFixture<CreatorProfilePageComponent>;
  let creatorServiceMock: {
    getCreatorProfile: ReturnType<typeof vi.fn>;
    follow: ReturnType<typeof vi.fn>;
    unfollow: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let authServiceMock: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
  };

  const mockProfile: CreatorPublicProfile = {
    id: 'creator-123',
    name: 'Elena Print3D',
    bio: 'Passionnée d impression 3D et modélisation résine',
    profileTags: ['print3d', 'resin'],
    avatarUrl: '/api/users/creator-123/avatar',
    createdAt: '2026-08-15T10:00:00.000Z',
    followersCount: 25,
    subscribersCount: 7,
    creationsCount: 2,
    isSelf: false,
    userInteractions: {
      isFollowing: false,
      isSubscribed: false,
      subscriptionExpiresAt: null,
    },
    creations: [
      {
        id: 'post-1',
        title: 'Figurine Dragon 3D',
        shortDescription: 'Fichier STL et paramètres d impression',
        category: 'Modèles 3D',
        tags: ['dragon', 'stl'],
        visibility: 'public',
        likesCount: 15,
        attachmentsCount: 2,
        hasAudio: false,
        coverUrl: '/api/posts/post-1/attachments/att-1',
        publishedAt: '2026-09-01T12:00:00.000Z',
        isLocked: false,
        author: { id: 'creator-123', name: 'Elena Print3D' },
      },
      {
        id: 'post-2',
        title: 'Buste Chevalier VIP',
        shortDescription: 'Modèle exclusif pour abonnés',
        category: 'Modèles 3D',
        tags: ['chevalier', 'vip'],
        visibility: 'subscribers',
        likesCount: 5,
        attachmentsCount: 1,
        hasAudio: false,
        coverUrl: null,
        publishedAt: '2026-09-10T12:00:00.000Z',
        isLocked: true,
        author: { id: 'creator-123', name: 'Elena Print3D' },
      },
    ],
  };

  beforeEach(async () => {
    creatorServiceMock = {
      getCreatorProfile: vi.fn().mockReturnValue(of(mockProfile)),
      follow: vi.fn().mockReturnValue(of({ following: true })),
      unfollow: vi.fn().mockReturnValue(of({ following: false })),
      subscribe: vi.fn().mockReturnValue(of({ subscribed: true, expiresAt: '2026-11-15T00:00:00.000Z' })),
    };

    authServiceMock = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      currentUser: vi.fn().mockReturnValue({ id: 'user-visitor', name: 'Visitor' }),
    };

    await TestBed.configureTestingModule({
      imports: [CreatorProfilePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'creator-123' : null),
              },
            },
          },
        },
        { provide: CreatorService, useValue: creatorServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatorProfilePageComponent);
    component = fixture.componentInstance;
  });

  it('charge et affiche le profil public avec compteurs réels et créations découvrables', () => {
    fixture.detectChanges();

    expect(creatorServiceMock.getCreatorProfile).toHaveBeenCalledWith('creator-123');
    expect(component.profile()).toEqual(mockProfile);
    expect(component.loading()).toBe(false);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Elena Print3D');
    expect(compiled.textContent).toContain('Passionnée d impression 3D');
    expect(compiled.textContent).toContain('25'); // followersCount
    expect(compiled.textContent).toContain('7'); // subscribersCount
    expect(compiled.textContent).toContain('Figurine Dragon 3D');
    expect(compiled.textContent).toContain('Buste Chevalier VIP');
    expect(compiled.textContent).toContain('Simulation — aucun paiement');
  });

  it('gère l action de suivi (follow) avec mise à jour optimiste', () => {
    fixture.detectChanges();

    component.follow();
    expect(creatorServiceMock.follow).toHaveBeenCalledWith('creator-123');
    expect(component.actionMessage()).toContain('Vous suivez désormais Elena Print3D');
  });

  it('gère l action de désabonnement (unfollow)', () => {
    fixture.detectChanges();

    component.unfollow();
    expect(creatorServiceMock.unfollow).toHaveBeenCalledWith('creator-123');
    expect(component.actionMessage()).toContain('Vous ne suivez plus Elena Print3D');
  });

  it('gère l action de souscription simulée 30 jours (subscribe)', () => {
    fixture.detectChanges();

    component.subscribe();
    expect(creatorServiceMock.subscribe).toHaveBeenCalledWith('creator-123');
    expect(component.actionMessage()).toContain('Simulation — aucun paiement');
  });

  it('affiche un message d erreur spécifique en cas de profil introuvable ou suspendu (404)', () => {
    creatorServiceMock.getCreatorProfile.mockReturnValue(
      throwError(() => ({ status: 404 }))
    );

    component.loadProfile('ghost-id');
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toContain('introuvable ou a été suspendu par la modération');
  });
});

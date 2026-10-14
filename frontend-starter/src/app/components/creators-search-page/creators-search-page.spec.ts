import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { CreatorsSearchPageComponent } from './creators-search-page';
import { CreatorService } from '../../shared/services/creator.service';
import { Page } from '../../shared/models/page.model';
import { CreatorSummary } from '../../shared/models/creator.model';

describe('CreatorsSearchPageComponent (Mission 1 — Recherche de Créateurs)', () => {
  let component: CreatorsSearchPageComponent;
  let fixture: ComponentFixture<CreatorsSearchPageComponent>;
  let creatorServiceMock: {
    getCreators: ReturnType<typeof vi.fn>;
  };

  const mockCreators: CreatorSummary[] = [
    {
      id: 'c-1',
      name: 'Camille Origami',
      bio: 'Artisane papier',
      profileTags: ['origami', 'diy'],
      avatarUrl: '/api/users/c-1/avatar',
      createdAt: '2026-09-01T00:00:00.000Z',
      followersCount: 12,
      creationsCount: 5,
      isFollowing: false,
    },
    {
      id: 'c-2',
      name: 'Bastien Paper',
      bio: 'Créations en carton',
      profileTags: ['papercraft'],
      avatarUrl: '/api/users/c-2/avatar',
      createdAt: '2026-09-05T00:00:00.000Z',
      followersCount: 8,
      creationsCount: 10,
      isFollowing: true,
    },
  ];

  const mockCreatorsPage: Page<CreatorSummary> = {
    items: mockCreators,
    docs: mockCreators,
    total: 2,
    totalDocs: 2,
    page: 1,
    limit: 12,
    pages: 1,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false,
  };

  beforeEach(async () => {
    creatorServiceMock = {
      getCreators: vi.fn().mockReturnValue(of(mockCreatorsPage)),
    };

    await TestBed.configureTestingModule({
      imports: [CreatorsSearchPageComponent],
      providers: [
        provideRouter([]),
        { provide: CreatorService, useValue: creatorServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatorsSearchPageComponent);
    component = fixture.componentInstance;
  });

  it('initialise et charge la liste des créateurs au démarrage', () => {
    fixture.detectChanges();

    expect(creatorServiceMock.getCreators).toHaveBeenCalledWith({
      page: 1,
      limit: 12,
      query: undefined,
    });
    expect(component.creators().length).toBe(2);
    expect(component.totalDocs()).toBe(2);
    expect(component.loading()).toBe(false);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Camille Origami');
    expect(compiled.textContent).toContain('Bastien Paper');
  });

  it('calcule correctement les initiales de créateur pour l avatar placeholder', () => {
    expect(component.getInitials('Camille Origami')).toBe('CO');
    expect(component.getInitials('Bastien')).toBe('BA');
    expect(component.getInitials('')).toBe('??');
  });

  it('efface la recherche et recharge quand clearSearch() est appelé', () => {
    fixture.detectChanges();
    component.searchControl.setValue('origami');
    component.clearSearch();

    expect(component.searchControl.value).toBe('');
  });

  it('gère les erreurs HTTP lors du chargement', () => {
    creatorServiceMock.getCreators.mockReturnValue(
      throwError(() => ({ error: { message: 'Erreur réseau' } }))
    );

    component.loadCreators(1);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Erreur réseau');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Erreur réseau');
  });
});

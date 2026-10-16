import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { PostsPageComponent } from './posts-page';
import { PostService } from '../../shared/services/post.service';
import { PostPreview } from '../../shared/models/post.model';
import { Page } from '../../shared/models/page.model';

describe('PostsPageComponent', () => {
  let component: PostsPageComponent;
  let fixture: ComponentFixture<PostsPageComponent>;
  let router: Router;
  let postServiceMock: {
    getPosts: ReturnType<typeof vi.fn>;
  };

  const mockPostPreview1: PostPreview = {
    id: 'post-1',
    title: 'Guitare Lego Custom',
    shortDescription: 'Un modèle réduit avec cordes nylon.',
    category: 'Lego',
    tags: ['lego', 'guitare'],
    visibility: 'public',
    author: { id: 'author-1', name: 'GuitarMaker' },
    likesCount: 12,
    commentsCount: 5,
    attachmentsCount: 2,
    hasAudio: false,
    coverUrl: null,
    isLocked: false,
    publishedAt: new Date().toISOString(),
  };

  const mockPostPreview2: PostPreview = {
    id: 'post-2',
    title: 'Faucon Millenium Papercraft',
    shortDescription: 'Modèle papier ultra détaillé.',
    category: 'Papercraft',
    tags: ['papercraft', 'star-wars'],
    visibility: 'public',
    author: { id: 'author-2', name: 'PaperMaster' },
    likesCount: 25,
    commentsCount: 8,
    attachmentsCount: 1,
    hasAudio: false,
    coverUrl: null,
    isLocked: false,
    publishedAt: new Date().toISOString(),
  };

  const mockPageCatalog: Page<PostPreview> = {
    items: [mockPostPreview1],
    docs: [mockPostPreview1],
    total: 1,
    totalDocs: 1,
    limit: 9,
    page: 1,
    pages: 2,
    totalPages: 2,
    hasPrevPage: false,
    hasNextPage: true,
    prevPage: null,
    nextPage: 2,
    pagingCounter: 1,
  };

  const mockPageSuggestions: Page<PostPreview> = {
    items: [mockPostPreview2],
    docs: [mockPostPreview2],
    total: 1,
    totalDocs: 1,
    limit: 5,
    page: 1,
    pages: 1,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
    pagingCounter: 1,
  };

  beforeEach(async () => {
    postServiceMock = {
      getPosts: vi.fn().mockImplementation((params) => {
        if (params.limit === 5) {
          return of(mockPageSuggestions);
        }
        return of(mockPageCatalog);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [PostsPageComponent],
      providers: [
        { provide: PostService, useValue: postServiceMock },
        provideRouter([]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(PostsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initialise le composant, charge le catalogue page 1 et affiche la pagination complète', () => {
    expect(component).toBeTruthy();
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: undefined,
      tags: undefined,
      sort: 'date-desc',
    });
    expect(component.posts().length).toBe(1);
    expect(component.posts()[0].title).toBe('Guitare Lego Custom');
    expect(component.totalPages()).toBe(2);
    expect(component.totalDocs()).toBe(1);

    const indicator = fixture.nativeElement.querySelector('.page-indicator');
    expect(indicator.textContent).toContain('Page 1 sur 2 (1 création au total)');
  });

  it('après 300 ms sans frappe, charge des suggestions (limit=5) SANS modifier les cards ni la pagination du catalogue', () => {
    vi.useFakeTimers();
    postServiceMock.getPosts.mockClear();

    // Saisie utilisateur
    component.searchControl.setValue('faucon');

    // Avant 300 ms : rien
    vi.advanceTimersByTime(200);
    expect(postServiceMock.getPosts).not.toHaveBeenCalled();

    // À 300 ms : appel de suggestion avec limit=5
    vi.advanceTimersByTime(100);
    expect(postServiceMock.getPosts).toHaveBeenCalledTimes(1);
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 5,
      category: undefined,
      query: 'faucon',
      tags: undefined,
      mode: 'suggest',
    });

    // L'état du catalogue reste STRICTEMENT inchangé
    expect(component.posts().length).toBe(1);
    expect(component.posts()[0].title).toBe('Guitare Lego Custom');
    expect(component.currentPage()).toBe(1);
    expect(component.totalDocs()).toBe(1);
    expect(component.loading()).toBe(false);

    // Le panneau de suggestions est ouvert avec les résultats de suggestion
    expect(component.showSuggestions()).toBe(true);
    expect(component.suggestions().length).toBe(1);
    expect(component.suggestions()[0].title).toBe('Faucon Millenium Papercraft');

    vi.useRealTimers();
  });

  it('appui sur Entrée sans suggestion surlignée soumet la recherche, ferme le panneau et recharge le catalogue page 1', () => {
    postServiceMock.getPosts.mockClear();
    component.searchControl.setValue('vaisseau');
    component.showSuggestions.set(true);

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeyDown(event);

    expect(component.showSuggestions()).toBe(false);
    expect(component.appliedQuery()).toBe('vaisseau');
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: 'vaisseau',
      tags: undefined,
      sort: 'relevance',
    });
  });

  it('appui sur Entrée sur un champ vide retire le filtre textuel et recharge le catalogue non filtré', () => {
    component.appliedQuery.set('ancien-filtre');
    component.searchControl.setValue('');
    postServiceMock.getPosts.mockClear();

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeyDown(event);

    expect(component.appliedQuery()).toBe('');
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: undefined,
      tags: undefined,
      sort: 'date-desc',
    });
  });

  it('navigation clavier dans les suggestions (Flèche Bas / Haut) et validation par Entrée ouvre le post', () => {
    component.showSuggestions.set(true);
    component.suggestions.set([mockPostPreview1, mockPostPreview2]);
    component.highlightedIndex.set(-1);

    // Flèche Bas -> premier item (index 0)
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.highlightedIndex()).toBe(0);

    // Flèche Bas -> deuxième item (index 1)
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.highlightedIndex()).toBe(1);

    // Flèche Bas -> boucle au premier (index 0)
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.highlightedIndex()).toBe(0);

    // Flèche Haut -> boucle au dernier (index 1)
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.highlightedIndex()).toBe(1);

    // Entrée sur l'item surligné -> navigation vers le post
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(router.navigate).toHaveBeenCalledWith(['/posts', 'post-2']);
    expect(component.showSuggestions()).toBe(false);
  });

  it('clic sur une suggestion ouvre le post correspondant sans appliquer de filtre au catalogue', () => {
    component.showSuggestions.set(true);
    component.suggestions.set([mockPostPreview2]);
    postServiceMock.getPosts.mockClear();

    component.openPost('post-2');

    expect(router.navigate).toHaveBeenCalledWith(['/posts', 'post-2']);
    expect(component.showSuggestions()).toBe(false);
    // Le catalogue n'a pas été rechargé
    expect(postServiceMock.getPosts).not.toHaveBeenCalled();
  });

  it('touche Échap ferme les suggestions sans effacer la saisie', () => {
    component.searchControl.setValue('test-echap');
    component.showSuggestions.set(true);

    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(component.showSuggestions()).toBe(false);
    expect(component.searchControl.value).toBe('test-echap');
  });

  it('clic extérieur ferme le panneau de suggestions', () => {
    component.showSuggestions.set(true);

    // Simule un clic en dehors du composant
    const outsideElement = document.createElement('div');
    component.onDocumentClick({ target: outsideElement } as unknown as MouseEvent);

    expect(component.showSuggestions()).toBe(false);
  });

  it('changement de catégorie ou de tag utilise la dernière recherche validée (appliedQuery), jamais la saisie non validée', () => {
    component.appliedQuery.set('requete-validee');
    component.searchControl.setValue('texte-non-valide');
    component.showSuggestions.set(true);
    postServiceMock.getPosts.mockClear();

    component.selectCategory('Lego');

    // Les suggestions sont fermées
    expect(component.showSuggestions()).toBe(false);
    // Le catalogue est rechargé avec 'requete-validee', pas avec 'texte-non-valide'
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: 'Lego',
      query: 'requete-validee',
      tags: undefined,
      sort: 'date-desc',
    });
  });

  it('SCÉNARIO CRITIQUE : une réponse de suggestions tardive ne rouvre pas le panneau si fermé ou remplacé', () => {
    const slowSuggestions$ = new Subject<Page<PostPreview>>();
    postServiceMock.getPosts.mockReturnValueOnce(slowSuggestions$);

    component.loadSuggestions('lente');
    expect(component.showSuggestions()).toBe(true);

    // L'utilisateur ferme les suggestions ou valide par Entrée
    component.closeSuggestions();
    expect(component.showSuggestions()).toBe(false);

    // La réponse tardive arrive
    slowSuggestions$.next(mockPageSuggestions);

    // Le panneau DOIT RESTER FERMÉ et les suggestions vides
    expect(component.showSuggestions()).toBe(false);
    expect(component.suggestions().length).toBe(0);
  });

  it('SCÉNARIO CRITIQUE : empêche qu’une réponse de catalogue tardive ne remplace les résultats d’une recherche plus récente', () => {
    const slowRequest$ = new Subject<Page<PostPreview>>();
    const fastRequest$ = new Subject<Page<PostPreview>>();

    // Première requête lente
    postServiceMock.getPosts.mockReturnValueOnce(slowRequest$);
    component.appliedQuery.set('requete-lente');
    component.loadPosts(1);

    // Deuxième requête plus rapide
    postServiceMock.getPosts.mockReturnValueOnce(fastRequest$);
    component.appliedQuery.set('requete-rapide');
    component.loadPosts(1);

    // La deuxième requête répond d'abord avec mockPostPreview2
    fastRequest$.next({
      items: [mockPostPreview2],
      docs: [mockPostPreview2],
      total: 1,
      totalDocs: 1,
      page: 1,
      pages: 1,
      limit: 9,
    });

    expect(component.posts().length).toBe(1);
    expect(component.posts()[0].title).toBe('Faucon Millenium Papercraft');

    // La première requête répond plus tard avec mockPostPreview1
    slowRequest$.next({
      items: [mockPostPreview1],
      docs: [mockPostPreview1],
      total: 1,
      totalDocs: 1,
      page: 1,
      pages: 1,
      limit: 9,
    });

    // La réponse tardive a été neutralisée : mockPostPreview2 reste affiché
    expect(component.posts().length).toBe(1);
    expect(component.posts()[0].title).toBe('Faucon Millenium Papercraft');
  });

  it('ignore les requêtes de page hors bornes ou vers la page courante', () => {
    postServiceMock.getPosts.mockClear();

    component.goToPage(0);
    component.goToPage(1);
    component.goToPage(5);

    expect(postServiceMock.getPosts).not.toHaveBeenCalled();
  });

  it('affiche la barre de pagination et totalDocs même pour 1 seule page avec boutons désactivés', () => {
    component.currentPage.set(1);
    component.totalPages.set(1);
    component.totalDocs.set(4);
    fixture.detectChanges();

    const indicator = fixture.nativeElement.querySelector('.page-indicator');
    expect(indicator.textContent).toContain('Page 1 sur 1 (4 créations au total)');

    const prevButton = fixture.nativeElement.querySelector('.btn-page:first-child');
    const nextButton = fixture.nativeElement.querySelector('.btn-page:last-child');
    expect(prevButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(true);
  });

  it('affiche l\'état vide @empty si aucun post n\'est retourné', () => {
    component.posts.set([]);
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('Aucune création trouvée correspondant à vos critères');
  });

  it('gère les erreurs de suggestion sans faire planter le catalogue', () => {
    postServiceMock.getPosts.mockReturnValue(
      throwError(() => ({ error: { message: 'Erreur réseau suggestion' } })),
    );

    component.loadSuggestions('erreur');

    expect(component.suggestionsLoading()).toBe(false);
    expect(component.suggestionsError()).toBe('Erreur réseau suggestion');
    // Le catalogue reste intact
    expect(component.error()).toBeNull();
  });

  it('affiche les cartes du catalogue avec le lien étendu et le badge de commentaires sans bouton redondant', () => {
    component.posts.set([mockPostPreview1, mockPostPreview2]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.catalogue-card');
    expect(cards.length).toBe(2);

    const stretchedLinks = compiled.querySelectorAll('.card-stretched-link');
    expect(stretchedLinks.length).toBe(2);
    const titles = Array.from(stretchedLinks).map((el) => el.textContent?.trim());
    expect(titles).toContain('Guitare Lego Custom');
    expect(titles).toContain('Faucon Millenium Papercraft');

    const commentsPills = compiled.querySelectorAll('.comments-pill');
    expect(commentsPills.length).toBe(2);
    const commentTexts = Array.from(commentsPills).map((el) => el.textContent?.trim());
    expect(commentTexts).toContain('💬 5');
    expect(commentTexts).toContain('💬 8');

    // Vérification de la suppression de l'ancien bouton redondant
    expect(compiled.querySelector('.btn-view')).toBeNull();
  });

  it('met à jour le critère de tri, remet à la page 1 et appelle le service avec le bon paramètre sort', () => {
    postServiceMock.getPosts.mockClear();

    component.setSortCriteria('likes-desc');

    expect(component.sortCriteria()).toBe('likes-desc');
    expect(postServiceMock.getPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        sort: 'likes-desc',
      }),
    );

    postServiceMock.getPosts.mockClear();
    component.setSortCriteria('date-asc');

    expect(component.sortCriteria()).toBe('date-asc');
    expect(postServiceMock.getPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        sort: 'date-asc',
      }),
    );
  });

  it('affiche le bouton Pertinence en présence d\'une recherche et réinitialise à date-desc à l\'effacement', () => {
    component.searchControl.setValue('origami');
    component.onSubmitSearch();

    expect(component.appliedQuery()).toBe('origami');
    expect(component.sortCriteria()).toBe('relevance');

    fixture.detectChanges();
    const relevanceBtn = fixture.nativeElement.querySelector('.sort-btn.active');
    expect(relevanceBtn?.textContent).toContain('Pertinence');

    // Effacement de la recherche
    component.clearSearch();
    expect(component.appliedQuery()).toBe('');
    expect(component.sortCriteria()).toBe('date-desc');
  });

  it('affiche la date de publication formatée sur les cartes du catalogue', () => {
    const postWithDate: PostPreview = {
      ...mockPostPreview1,
      publishedAt: '2026-10-14T10:00:00.000Z',
    };
    component.posts.set([postWithDate]);
    fixture.detectChanges();

    const dateBadges = fixture.nativeElement.querySelectorAll('.date-badge, .meta-date');
    expect(dateBadges.length).toBeGreaterThanOrEqual(1);
    const combinedText = Array.from(dateBadges).map((el: any) => el.textContent).join(' ').toLowerCase();
    expect(combinedText).toContain('14 oct');
    expect(combinedText).toContain('2026');
  });

  it('affiche l\'image de l\'avatar réel de l\'auteur si hasAvatar et avatarUrl sont présents', () => {
    const postWithAvatar: PostPreview = {
      ...mockPostPreview1,
      author: {
        id: 'user-42',
        name: 'Alice Builder',
        hasAvatar: true,
        avatarUrl: '/api/users/user-42/avatar',
      },
    };
    component.posts.set([postWithAvatar]);
    fixture.detectChanges();

    const avatarImg = fixture.nativeElement.querySelector('.author-avatar-img') as HTMLImageElement;
    expect(avatarImg).not.toBeNull();
    expect(avatarImg.getAttribute('src')).toBe('/api/users/user-42/avatar');
    expect(avatarImg.getAttribute('alt')).toBe('Alice Builder');
  });

  it('bascule sur les initiales de l\'auteur en cas d\'absence d\'avatar ou d\'erreur de chargement', () => {
    const postWithoutAvatar: PostPreview = {
      ...mockPostPreview1,
      author: {
        id: 'user-99',
        name: 'Bob Artisan',
        hasAvatar: false,
        avatarUrl: null,
      },
    };
    component.posts.set([postWithoutAvatar]);
    fixture.detectChanges();

    let avatarImg = fixture.nativeElement.querySelector('.author-avatar-img');
    let initialsSpan = fixture.nativeElement.querySelector('.author-avatar');
    expect(avatarImg).toBeNull();
    expect(initialsSpan?.textContent?.trim()).toBe('BA');

    // Test de l'erreur de chargement
    const postWithBrokenAvatar: PostPreview = {
      ...mockPostPreview1,
      author: {
        id: 'user-broken',
        name: 'Charlie Broken',
        hasAvatar: true,
        avatarUrl: '/api/users/user-broken/avatar',
      },
    };
    component.posts.set([postWithBrokenAvatar]);
    fixture.detectChanges();

    avatarImg = fixture.nativeElement.querySelector('.author-avatar-img');
    expect(avatarImg).not.toBeNull();

    // Déclenchement de l'erreur
    component.markAvatarFailed('user-broken');
    fixture.detectChanges();

    avatarImg = fixture.nativeElement.querySelector('.author-avatar-img');
    initialsSpan = fixture.nativeElement.querySelector('.author-avatar');
    expect(avatarImg).toBeNull();
    expect(initialsSpan?.textContent?.trim()).toBe('CB');
  });

  it('nettoie les abonnements lors de la destruction (ngOnDestroy)', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});

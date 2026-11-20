import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Params, Router, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PostsPageComponent } from './posts-page';
import { PostService } from '../../shared/services/post.service';
import { CreatorService } from '../../shared/services/creator.service';
import { PostFilterParams, PostPreview } from '../../shared/models/post.model';
import { CreatorSummary } from '../../shared/models/creator.model';
import { Page } from '../../shared/models/page.model';

function makePage<T>(docs: T[], extra: Partial<Page<T>> = {}): Page<T> {
  return {
    items: docs,
    docs,
    page: 1,
    limit: 9,
    total: docs.length,
    totalDocs: docs.length,
    pages: 1,
    totalPages: 1,
    ...extra,
  };
}

const post: PostPreview = {
  id: 'p-1',
  title: 'Grue origami',
  shortDescription: 'Pliage traditionnel',
  category: 'Origami',
  tags: ['grue'],
  visibility: 'public',
  author: { id: 'author-1', name: 'Marcel' },
  likesCount: 3,
  commentsCount: 0,
  attachmentsCount: 0,
  hasAudio: false,
  coverUrl: null,
  isLocked: false,
  publishedAt: '2026-10-01T10:00:00.000Z',
};

const creator: CreatorSummary = {
  id: 'author-1',
  name: 'Marcel',
  bio: '',
  profileTags: [],
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  followersCount: 2,
  creationsCount: 4,
};

describe('PostsPageComponent — filtre auteur, taille de page et pagination numérotée', () => {
  let fixture: ComponentFixture<PostsPageComponent>;
  let component: PostsPageComponent;
  let queryParams$: BehaviorSubject<Params>;
  let postServiceMock: { getPosts: ReturnType<typeof vi.fn> };
  let creatorServiceMock: { getCreators: ReturnType<typeof vi.fn> };
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  function lastParams(): PostFilterParams {
    const calls = postServiceMock.getPosts.mock.calls;
    return calls[calls.length - 1][0] as PostFilterParams;
  }

  async function setup(initialParams: Params = {}): Promise<void> {
    queryParams$ = new BehaviorSubject<Params>(initialParams);
    postServiceMock = {
      getPosts: vi.fn().mockReturnValue(of(makePage([post], { totalPages: 10, pages: 10 }))),
    };
    creatorServiceMock = {
      getCreators: vi.fn().mockReturnValue(of(makePage([creator]))),
    };

    await TestBed.configureTestingModule({
      imports: [PostsPageComponent],
      providers: [
        provideRouter([]),
        { provide: PostService, useValue: postServiceMock },
        { provide: CreatorService, useValue: creatorServiceMock },
        { provide: ActivatedRoute, useValue: { queryParams: queryParams$.asObservable() } },
      ],
    }).compileComponents();

    navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PostsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('lecture des queryParams', () => {
    it('sans filtre : un seul chargement page 1 sans author', async () => {
      await setup();
      expect(postServiceMock.getPosts).toHaveBeenCalledTimes(1);
      expect(lastParams().author).toBeUndefined();
      expect(lastParams().authorName).toBeUndefined();
    });

    it('author + authorName : envoie uniquement author (ID prioritaire)', async () => {
      await setup({ author: 'author-1', authorName: 'Marcel' });
      expect(postServiceMock.getPosts).toHaveBeenCalledTimes(1);
      expect(lastParams().author).toBe('author-1');
      expect(lastParams().authorName).toBeUndefined();
      expect(component.selectedAuthorName()).toBe('Marcel');
      expect(component.authorSearchControl.value).toBe('Marcel');
    });

    it('authorName seul : envoie authorName', async () => {
      await setup({ authorName: '  Marcel  ' });
      expect(lastParams().authorName).toBe('Marcel');
      expect(lastParams().author).toBeUndefined();
    });

    it('applique query, category et tag depuis l URL', async () => {
      await setup({ query: 'grue', category: 'Origami', tag: 'GRUE' });
      const p = lastParams();
      expect(p.query).toBe('grue');
      expect(p.category).toBe('Origami');
      expect(p.tags).toBe('grue');
      expect(component.searchControl.value).toBe('grue');
    });

    it('recharge quand les queryParams changent (navigation entre créateurs)', async () => {
      await setup({ author: 'author-1' });
      queryParams$.next({ author: 'author-2', authorName: 'Bob' });
      expect(postServiceMock.getPosts).toHaveBeenCalledTimes(2);
      expect(lastParams().author).toBe('author-2');
    });

    it('le badge de filtre actif est affiché avec le nom du créateur', async () => {
      await setup({ author: 'author-1', authorName: 'Marcel' });
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Marcel');
    });
  });

  describe('sélection et effacement du filtre', () => {
    beforeEach(async () => {
      await setup();
      postServiceMock.getPosts.mockClear();
    });

    it('selectCreatorFilter charge la page 1 filtrée par ID', () => {
      component.currentPage.set(4);
      component.selectCreatorFilter(creator);
      expect(lastParams()).toMatchObject({ page: 1, author: 'author-1' });
      expect(component.showCreatorSuggestions()).toBe(false);
      expect(component.authorSearchControl.value).toBe('Marcel');
    });

    it('applyAuthorNameFilter avec un nouveau nom bascule sur authorName', () => {
      component.selectCreatorFilter(creator);
      component.authorSearchControl.setValue('Bob', { emitEvent: false });
      component.applyAuthorNameFilter();
      expect(component.selectedAuthorId()).toBe('');
      expect(lastParams().authorName).toBe('Bob');
      expect(lastParams().author).toBeUndefined();
    });

    it('applyAuthorNameFilter avec le même nom (casse différente) garde l ID', () => {
      component.selectCreatorFilter(creator);
      component.authorSearchControl.setValue('MARCEL', { emitEvent: false });
      component.applyAuthorNameFilter();
      expect(component.selectedAuthorId()).toBe('author-1');
      expect(lastParams().author).toBe('author-1');
    });

    it('applyAuthorNameFilter vide efface le filtre', () => {
      component.selectCreatorFilter(creator);
      postServiceMock.getPosts.mockClear();
      component.authorSearchControl.setValue('   ', { emitEvent: false });
      component.applyAuthorNameFilter();
      expect(component.selectedAuthorId()).toBe('');
      expect(component.selectedAuthorName()).toBe('');
      expect(postServiceMock.getPosts).toHaveBeenCalledTimes(1);
      expect(lastParams().author).toBeUndefined();
    });

    it('clearAuthorFilter ne recharge pas si aucun filtre actif', () => {
      component.clearAuthorFilter();
      expect(postServiceMock.getPosts).not.toHaveBeenCalled();
    });

    it('filterByPostAuthor stoppe la propagation et filtre par auteur du post', () => {
      const event = new MouseEvent('click', { cancelable: true });
      const stop = vi.spyOn(event, 'stopPropagation');
      component.filterByPostAuthor(post.author, event);
      expect(stop).toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(lastParams().author).toBe('author-1');
    });

    it('le filtre auteur est conservé lors du changement de page et de catégorie', () => {
      component.selectCreatorFilter(creator);
      component.goToPage(3);
      expect(lastParams()).toMatchObject({ page: 3, author: 'author-1' });
      component.selectCategory('Lego');
      expect(lastParams()).toMatchObject({ page: 1, author: 'author-1', category: 'Lego' });
    });
  });

  describe('autocomplétion des créateurs', () => {
    beforeEach(async () => {
      await setup();
    });

    it('requête vide : aucun appel et liste fermée', () => {
      component.loadCreatorSuggestions('   ');
      expect(creatorServiceMock.getCreators).not.toHaveBeenCalled();
      expect(component.showCreatorSuggestions()).toBe(false);
    });

    it('appelle getCreators avec limit 5 et ouvre la liste', () => {
      component.loadCreatorSuggestions(' Mar ');
      expect(creatorServiceMock.getCreators).toHaveBeenCalledWith({ query: 'Mar', limit: 5, page: 1 });
      expect(component.creatorSuggestions()).toEqual([creator]);
      expect(component.showCreatorSuggestions()).toBe(true);
    });

    it('aucun résultat : liste fermée', () => {
      creatorServiceMock.getCreators.mockReturnValueOnce(of(makePage<CreatorSummary>([])));
      component.loadCreatorSuggestions('zzz');
      expect(component.showCreatorSuggestions()).toBe(false);
    });

    it('erreur serveur : liste vidée et fermée', () => {
      creatorServiceMock.getCreators.mockReturnValueOnce(throwError(() => new Error('boom')));
      component.loadCreatorSuggestions('Mar');
      expect(component.creatorSuggestions()).toEqual([]);
      expect(component.showCreatorSuggestions()).toBe(false);
    });

    it('la saisie est debouncée (250 ms) avant l appel', async () => {
      vi.useFakeTimers();
      TestBed.resetTestingModule();
      await setup();
      component.authorSearchControl.setValue('M');
      component.authorSearchControl.setValue('Ma');
      component.authorSearchControl.setValue('Mar');
      expect(creatorServiceMock.getCreators).not.toHaveBeenCalled();
      vi.advanceTimersByTime(260);
      expect(creatorServiceMock.getCreators).toHaveBeenCalledTimes(1);
      expect(creatorServiceMock.getCreators).toHaveBeenCalledWith({ query: 'Mar', limit: 5, page: 1 });
    });

    it('un clic hors du composant ferme la liste des créateurs', () => {
      component.loadCreatorSuggestions('Mar');
      component.onDocumentClick({ target: document.body } as unknown as MouseEvent);
      expect(component.showCreatorSuggestions()).toBe(false);
    });
  });

  describe('synchronisation avec l URL (régressions)', () => {
    it('revenir sur /posts sans paramètres efface le filtre auteur et recharge', async () => {
      await setup({ author: 'author-1', authorName: 'Marcel' });
      postServiceMock.getPosts.mockClear();
      queryParams$.next({});
      expect(component.selectedAuthorId()).toBe('');
      expect(component.selectedAuthorName()).toBe('');
      expect(component.authorSearchControl.value).toBe('');
      expect(postServiceMock.getPosts).toHaveBeenCalledTimes(1);
      expect(lastParams().author).toBeUndefined();
    });

    it('revenir sans paramètres efface aussi catégorie, tag et recherche', async () => {
      await setup({ query: 'grue', category: 'Origami', tag: 'pliage' });
      queryParams$.next({});
      expect(component.appliedQuery()).toBe('');
      expect(component.selectedCategory()).toBe('');
      expect(component.selectedTag()).toBe('');
      expect(lastParams()).toMatchObject({ query: undefined, category: undefined, tags: undefined });
    });

    it('category=Toutes dans l URL équivaut à aucun filtre', async () => {
      await setup({ category: 'Toutes' });
      expect(component.selectedCategory()).toBe('');
      expect(lastParams().category).toBeUndefined();
    });

    it('selectCreatorFilter écrit author et authorName dans l URL (replaceUrl)', async () => {
      await setup();
      component.selectCreatorFilter(creator);
      expect(navigateSpy).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({
          queryParams: { author: 'author-1', authorName: 'Marcel' },
          replaceUrl: true,
        }),
      );
    });

    it('clearAuthorFilter retire les paramètres de l URL', async () => {
      await setup({ author: 'author-1', authorName: 'Marcel' });
      component.clearAuthorFilter();
      expect(navigateSpy).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: {} }));
    });

    it('catégorie, tag et recherche sont aussi reflétés dans l URL', async () => {
      await setup();
      component.selectCategory('Menuiserie');
      component.selectTag('Bois');
      component.searchControl.setValue('table', { emitEvent: false });
      component.onSubmitSearch();
      expect(navigateSpy).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({ queryParams: { query: 'table', category: 'Menuiserie', tag: 'bois' } }),
      );
    });

    it('l écho de notre propre navigation ne provoque pas de second chargement', async () => {
      await setup();
      component.selectCreatorFilter(creator);
      postServiceMock.getPosts.mockClear();
      queryParams$.next({ author: 'author-1', authorName: 'Marcel' });
      expect(postServiceMock.getPosts).not.toHaveBeenCalled();
    });

    it('changer de page ne touche pas à l URL', async () => {
      await setup();
      navigateSpy.mockClear();
      component.goToPage(2);
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  describe('catégories', () => {
    it('propose les 9 catégories du backend en plus de Toutes', async () => {
      await setup();
      expect(component.categories).toEqual([
        'Toutes', 'Menuiserie', 'Électronique', 'Maroquinerie', 'Lego',
        'Papercraft', 'Origami', 'Musique', 'Modèles 3D', 'Autre',
      ]);
    });

    it.each(['Menuiserie', 'Électronique', 'Maroquinerie'])('filtre sur %s', async (cat) => {
      await setup();
      component.selectCategory(cat);
      expect(lastParams().category).toBe(cat);
    });
  });

  describe('champ de recherche (régressions vues dans le navigateur)', () => {
    it('Entrée puis fin du debounce : la liste de suggestions ne se rouvre pas', async () => {
      vi.useFakeTimers();
      TestBed.resetTestingModule();
      await setup();
      component.searchControl.setValue('guitare bluse');
      component.onSubmitSearch();
      vi.advanceTimersByTime(350);
      expect(component.showSuggestions()).toBe(false);
      expect(postServiceMock.getPosts).not.toHaveBeenCalledWith(expect.objectContaining({ mode: 'suggest' }));
    });

    it('un nouveau texte après la validation propose de nouveau des suggestions', async () => {
      vi.useFakeTimers();
      TestBed.resetTestingModule();
      await setup();
      component.searchControl.setValue('guitare');
      component.onSubmitSearch();
      component.searchControl.setValue('guitare blues');
      vi.advanceTimersByTime(350);
      expect(component.showSuggestions()).toBe(true);
      expect(postServiceMock.getPosts).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'suggest', query: 'guitare blues' }),
      );
    });

    it('les boutons Effacer et Chercher sont regroupés et Effacer est une croix accessible', async () => {
      await setup();
      const el = fixture.nativeElement as HTMLElement;
      // Saisie réelle dans le champ (événement input) comme dans le navigateur
      const input = el.querySelector<HTMLInputElement>('#search-input');
      input!.value = 'dragon';
      input!.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const actions = el.querySelector('#search-input + .search-actions');
      expect(actions).not.toBeNull();
      const clear = actions?.querySelector<HTMLButtonElement>('.btn-clear-search');
      expect(clear?.textContent?.trim()).toBe('✕');
      expect(clear?.getAttribute('aria-label')).toBe('Effacer la recherche');
      expect(actions?.querySelector('.btn-search')?.textContent?.trim()).toBe('Chercher');
      expect(el.querySelector('#search-input')?.classList.contains('with-clear')).toBe(true);
    });

    it('un lien /posts?query=... trie par pertinence, comme une saisie + Entrée', async () => {
      await setup({ query: 'chateua' });
      expect(component.sortCriteria()).toBe('relevance');
      expect(lastParams()).toMatchObject({ query: 'chateua', sort: 'relevance' });
    });

    it('revenir sur /posts sans recherche repasse au tri par date', async () => {
      await setup({ query: 'chateua' });
      queryParams$.next({});
      expect(component.sortCriteria()).toBe('date-desc');
      expect(lastParams().sort).toBe('date-desc');
    });

    it('un tri choisi explicitement (likes) est conservé avec une recherche dans l URL', async () => {
      await setup();
      component.setSortCriteria('likes-desc');
      queryParams$.next({ query: 'dragon' });
      expect(component.sortCriteria()).toBe('likes-desc');
    });

    it('sans texte, pas de croix et pas de marge réservée', async () => {
      await setup();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('#search-input + .search-actions .btn-clear-search')).toBeNull();
      expect(el.querySelector('#search-input')?.classList.contains('with-clear')).toBe(false);
    });
  });

  describe('taille de page', () => {
    beforeEach(async () => {
      await setup();
      postServiceMock.getPosts.mockClear();
    });

    it('accepte une valeur de la liste et recharge page 1', () => {
      component.setPageSize('12');
      expect(component.pageSize()).toBe(12);
      expect(lastParams()).toMatchObject({ page: 1, limit: 12 });
    });

    it.each([0, 21, -3, 4.5, 'abc'])('ignore la valeur invalide %s', (value) => {
      component.setPageSize(value);
      expect(component.pageSize()).toBe(9);
      expect(postServiceMock.getPosts).not.toHaveBeenCalled();
    });

    it('ne recharge pas si la taille est inchangée', () => {
      component.setPageSize(9);
      expect(postServiceMock.getPosts).not.toHaveBeenCalled();
    });

    it('toutes les options proposées respectent la borne serveur 1..20', () => {
      expect(component.pageSizeOptions.every((n) => n >= 1 && n <= 20)).toBe(true);
    });
  });

  describe('pagination numérotée', () => {
    beforeEach(async () => {
      await setup();
    });

    it.each([
      [10, 1, [1, 2, 3, 4, 5]],
      [10, 5, [3, 4, 5, 6, 7]],
      [10, 9, [6, 7, 8, 9, 10]],
      [10, 10, [6, 7, 8, 9, 10]],
      [3, 2, [1, 2, 3]],
      [1, 1, [1]],
      [0, 1, [1]],
    ])('totalPages=%i, page=%i → %j', (total, current, expected) => {
      component.totalPages.set(total);
      component.currentPage.set(current);
      expect(component.pageNumbers()).toEqual(expected);
    });

    it('goToPage ignore les pages hors bornes, la page courante et pendant un chargement', () => {
      postServiceMock.getPosts.mockClear();
      component.totalPages.set(5);
      component.currentPage.set(2);
      component.goToPage(0);
      component.goToPage(6);
      component.goToPage(2);
      component.loading.set(true);
      component.goToPage(3);
      expect(postServiceMock.getPosts).not.toHaveBeenCalled();
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { PostsPageComponent } from './posts-page';
import { PostService } from '../../shared/services/post.service';
import { PostPreview } from '../../shared/models/post.model';
import { Page } from '../../shared/models/page.model';
import { provideRouter } from '@angular/router';

describe('PostsPageComponent', () => {
  let component: PostsPageComponent;
  let fixture: ComponentFixture<PostsPageComponent>;
  let postServiceMock: {
    getPosts: ReturnType<typeof vi.fn>;
  };

  const mockPostPreview: PostPreview = {
    id: 'post-123',
    title: 'Guitare Lego Custom',
    shortDescription: 'Un modèle réduit avec cordes nylon.',
    category: 'Lego',
    tags: ['lego', 'guitare'],
    visibility: 'public',
    author: { id: 'author-1', name: 'GuitarMaker' },
    likesCount: 12,
    attachmentsCount: 2,
    hasAudio: false,
    coverUrl: null,
    isLocked: false,
    publishedAt: new Date().toISOString(),
  };

  const mockPage: Page<PostPreview> = {
    items: [mockPostPreview],
    docs: [mockPostPreview],
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

  beforeEach(async () => {
    postServiceMock = {
      getPosts: vi.fn().mockReturnValue(of(mockPage)),
    };

    await TestBed.configureTestingModule({
      imports: [PostsPageComponent],
      providers: [
        { provide: PostService, useValue: postServiceMock },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PostsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initialise le composant et charge la première page de posts', () => {
    expect(component).toBeTruthy();
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: undefined,
      tags: undefined,
    });
    expect(component.posts().length).toBe(1);
    expect(component.posts()[0].title).toBe('Guitare Lego Custom');
    expect(component.totalPages()).toBe(2);
  });

  it('applique un filtre de catégorie et recharge la page 1', () => {
    component.selectedCategory.set('Lego');
    component.onFilterChange();

    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: 'Lego',
      query: undefined,
      tags: undefined,
    });
  });

  it('applique une recherche textuelle', () => {
    component.searchQuery.set('custom');
    component.onFilterChange();

    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: 'custom',
      tags: undefined,
    });
  });

  it('applique un filtre par tag via selectTag et permet de le retirer', () => {
    component.selectTag('lego');

    expect(component.selectedTag()).toBe('lego');
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: undefined,
      tags: 'lego',
    });

    // Clic à nouveau sur le même tag -> désélectionne le tag
    component.selectTag('lego');
    expect(component.selectedTag()).toBe('');
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: undefined,
      tags: undefined,
    });
  });

  it('efface le filtre par tag via clearTag', () => {
    component.selectTag('papercraft');
    expect(component.selectedTag()).toBe('papercraft');

    component.clearTag();
    expect(component.selectedTag()).toBe('');
    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: undefined,
      query: undefined,
      tags: undefined,
    });
  });

  it('combine recherche textuelle, catégorie et tag', () => {
    component.searchQuery.set('vaisseau');
    component.selectedCategory.set('Lego');
    component.selectedTag.set('star-wars');
    component.onFilterChange();

    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      category: 'Lego',
      query: 'vaisseau',
      tags: 'star-wars',
    });
  });

  it('navigue entre les pages via goToPage', () => {
    component.goToPage(2);

    expect(postServiceMock.getPosts).toHaveBeenCalledWith({
      page: 2,
      limit: 9,
      category: undefined,
      query: undefined,
      tags: undefined,
    });
  });

  it('ignore les requêtes de page hors bornes', () => {
    component.goToPage(0);
    component.goToPage(5);

    // Ne doit pas avoir été appelé pour 0 ou 5
    expect(postServiceMock.getPosts).not.toHaveBeenCalledWith(
      expect.objectContaining({ page: 0 }),
    );
    expect(postServiceMock.getPosts).not.toHaveBeenCalledWith(
      expect.objectContaining({ page: 5 }),
    );
  });

  it('gère les erreurs de chargement', () => {
    postServiceMock.getPosts.mockReturnValue(
      throwError(() => ({ error: { message: 'Erreur réseau' } })),
    );

    component.loadPosts(1);

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Erreur réseau');
  });
});

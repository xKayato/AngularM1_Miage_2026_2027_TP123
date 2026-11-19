import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { PostService } from '../../shared/services/post.service';
import { CreatorService } from '../../shared/services/creator.service';
import { PostFilterParams, PostPreview } from '../../shared/models/post.model';
import { CreatorSummary } from '../../shared/models/creator.model';

export type SortCriteria = 'date-desc' | 'likes-desc' | 'date-asc' | 'relevance';

@Component({
  selector: 'app-posts-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './posts-page.html',
  styleUrls: ['./posts-page.css'],
})
export class PostsPageComponent implements OnInit, OnDestroy {
  private readonly postService = inject(PostService);
  private readonly creatorService = inject(CreatorService, { optional: true });
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly elementRef = inject(ElementRef);

  private routeSubscription?: Subscription;
  private searchSubscription?: Subscription;
  private authorSearchSubscription?: Subscription;
  private postsSubscription?: Subscription;
  private suggestionsSubscription?: Subscription;
  private creatorSuggestionsSubscription?: Subscription;
  private currentRequestId = 0;
  private currentSuggestionRequestId = 0;

  // Catalogue & Pagination
  readonly posts = signal<PostPreview[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalDocs = signal<number>(0);
  readonly pageSize = signal<number>(9);
  readonly pageSizeOptions = [3, 6, 9, 12, 16, 20];

  readonly pageNumbers = computed<number[]>(() => {
    const total = Math.max(1, this.totalPages());
    const current = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    for (let i = adjustedStart; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  readonly selectedCategory = signal<string>('');
  readonly selectedTag = signal<string>('');
  readonly appliedQuery = signal<string>('');

  // Filtre par utilisateur / créateur
  readonly selectedAuthorId = signal<string>('');
  readonly selectedAuthorName = signal<string>('');
  readonly authorSearchControl = new FormControl('', { nonNullable: true });
  readonly creatorSuggestions = signal<CreatorSummary[]>([]);
  readonly showCreatorSuggestions = signal<boolean>(false);

  // Tri interactif Figma MakerShare v2
  readonly sortCriteria = signal<SortCriteria>('date-desc');

  readonly sortedPosts = computed(() => {
    const list = [...this.posts()];
    const criteria = this.sortCriteria();

    if (criteria === 'likes-desc') {
      return list.sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0));
    }
    if (criteria === 'date-asc') {
      return list.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateA - dateB;
      });
    }
    if (criteria === 'date-desc') {
      return list.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      });
    }
    return list;
  });

  // Recherche & Suggestions
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly suggestions = signal<PostPreview[]>([]);
  readonly showSuggestions = signal<boolean>(false);
  readonly suggestionsLoading = signal<boolean>(false);
  readonly suggestionsError = signal<string | null>(null);
  readonly highlightedIndex = signal<number>(-1);

  readonly categories = [
    'Toutes',
    'Menuiserie',
    'Électronique',
    'Maroquinerie',
    'Lego',
    'Papercraft',
    'Origami',
    'Musique',
    'Modèles 3D',
    'Autre',
  ];

  ngOnInit(): void {
    let initialLoaded = false;

    if (this.route?.queryParams) {
      this.routeSubscription = this.route.queryParams.subscribe((params) => {
        const q = typeof params['query'] === 'string' ? params['query'].trim() : '';
        const author = typeof params['author'] === 'string' ? params['author'].trim() : '';
        const authorName = typeof params['authorName'] === 'string' ? params['authorName'].trim() : '';
        const cat = typeof params['category'] === 'string' ? params['category'].trim() : '';
        const tag = typeof params['tag'] === 'string' ? params['tag'].trim().toLowerCase() : '';

        const hasUrlFilters = Boolean(q || author || authorName || cat || tag);

        if (hasUrlFilters) {
          this.appliedQuery.set(q);
          this.searchControl.setValue(q, { emitEvent: false });
          this.selectedAuthorId.set(author);
          this.selectedAuthorName.set(authorName);
          this.authorSearchControl.setValue(authorName, { emitEvent: false });
          if (cat) this.selectedCategory.set(cat);
          if (tag) this.selectedTag.set(tag);
          initialLoaded = true;
          this.loadPosts(1);
        } else if (!initialLoaded) {
          initialLoaded = true;
          this.loadPosts(1);
        }
      });
    }

    if (!initialLoaded) {
      this.loadPosts(1);
    }

    this.searchSubscription = this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.loadSuggestions(query);
      });

    this.authorSearchSubscription = this.authorSearchControl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe((nameQuery) => {
        this.loadCreatorSuggestions(nameQuery);
      });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.searchSubscription?.unsubscribe();
    this.authorSearchSubscription?.unsubscribe();
    this.postsSubscription?.unsubscribe();
    this.suggestionsSubscription?.unsubscribe();
    this.creatorSuggestionsSubscription?.unsubscribe();
    for (const url of this.createdObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.createdObjectUrls.length = 0;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (
      (this.showSuggestions() || this.showCreatorSuggestions()) &&
      !this.elementRef.nativeElement.contains(event.target)
    ) {
      this.closeSuggestions();
      this.showCreatorSuggestions.set(false);
    }
  }

  setSortCriteria(criteria: SortCriteria): void {
    if (this.sortCriteria() !== criteria) {
      this.sortCriteria.set(criteria);
      this.loadPosts(1);
    }
  }

  setPageSize(newLimit: number | string): void {
    const parsed = Number(newLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) return;
    if (this.pageSize() !== parsed) {
      this.pageSize.set(parsed);
      this.loadPosts(1);
    }
  }

  loadCreatorSuggestions(query: string): void {
    const trimmed = query.trim();
    if (!trimmed || !this.creatorService || typeof this.creatorService.getCreators !== 'function') {
      this.creatorSuggestions.set([]);
      this.showCreatorSuggestions.set(false);
      return;
    }

    this.creatorSuggestionsSubscription?.unsubscribe();
    this.creatorSuggestionsSubscription = this.creatorService
      .getCreators({ query: trimmed, limit: 5, page: 1 })
      .subscribe({
        next: (res) => {
          const list = res.docs || res.items || [];
          this.creatorSuggestions.set(list);
          this.showCreatorSuggestions.set(list.length > 0);
        },
        error: () => {
          this.creatorSuggestions.set([]);
          this.showCreatorSuggestions.set(false);
        },
      });
  }

  selectCreatorFilter(creator: CreatorSummary): void {
    this.showCreatorSuggestions.set(false);
    this.selectedAuthorId.set(creator.id);
    this.selectedAuthorName.set(creator.name);
    this.authorSearchControl.setValue(creator.name, { emitEvent: false });
    this.loadPosts(1);
  }

  applyAuthorNameFilter(): void {
    this.showCreatorSuggestions.set(false);
    const val = this.authorSearchControl.value.trim();
    if (!val) {
      this.clearAuthorFilter();
      return;
    }
    // Si l'utilisateur tape un nom différent du créateur sélectionné par ID, on filtre par nom
    if (val.toLowerCase() !== this.selectedAuthorName().toLowerCase()) {
      this.selectedAuthorId.set('');
      this.selectedAuthorName.set(val);
    }
    this.loadPosts(1);
  }

  filterByPostAuthor(author: { id: string; name: string }, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.selectedAuthorId.set(author.id);
    this.selectedAuthorName.set(author.name);
    this.authorSearchControl.setValue(author.name, { emitEvent: false });
    this.loadPosts(1);
  }

  clearAuthorFilter(): void {
    this.showCreatorSuggestions.set(false);
    this.authorSearchControl.setValue('', { emitEvent: false });
    if (this.selectedAuthorId() || this.selectedAuthorName()) {
      this.selectedAuthorId.set('');
      this.selectedAuthorName.set('');
      this.loadPosts(1);
    }
  }

  readonly failedAvatars = signal<Record<string, boolean>>({});
  readonly coverBlobUrls = signal<Record<string, string>>({});
  readonly failedCovers = signal<Record<string, boolean>>({});
  private readonly loadingCoverIds = new Set<string>();
  private readonly createdObjectUrls: string[] = [];

  isAvatarFailed(id: string): boolean {
    return Boolean(this.failedAvatars()[id]);
  }

  markAvatarFailed(id: string): void {
    this.failedAvatars.update((map) => ({ ...map, [id]: true }));
  }

  markCoverFailed(postId: string): void {
    this.failedCovers.update((map) => ({ ...map, [postId]: true }));
  }

  getPostCoverUrl(post: PostPreview): string | null {
    if (!post.coverUrl || this.failedCovers()[post.id]) {
      return null;
    }
    const blobUrl = this.coverBlobUrls()[post.id];
    if (blobUrl) {
      return blobUrl;
    }
    if (post.visibility !== 'public' && this.loadingCoverIds.has(post.id)) {
      return null;
    }
    return post.coverUrl;
  }

  private preloadProtectedCovers(list: PostPreview[]): void {
    if (typeof this.postService.getAttachmentBlob !== 'function') return;
    for (const post of list) {
      if (
        !post.isLocked &&
        post.coverUrl &&
        post.visibility !== 'public' &&
        !this.coverBlobUrls()[post.id] &&
        !this.loadingCoverIds.has(post.id)
      ) {
        const match = post.coverUrl.match(/\/api\/posts\/([^/]+)\/attachments\/([^/?#]+)/);
        if (!match) continue;
        const obs$ = this.postService.getAttachmentBlob(match[1], match[2]);
        if (!obs$ || typeof obs$.subscribe !== 'function') continue;
        this.loadingCoverIds.add(post.id);
        obs$.subscribe({
          next: (blob) => {
            this.loadingCoverIds.delete(post.id);
            if (blob && typeof URL.createObjectURL === 'function') {
              try {
                const url = URL.createObjectURL(blob);
                this.createdObjectUrls.push(url);
                this.coverBlobUrls.update((m) => ({ ...m, [post.id]: url }));
              } catch {
                // Fallback silencieux sous environnement de test jsdom
              }
            }
          },
          error: () => {
            this.loadingCoverIds.delete(post.id);
            this.markCoverFailed(post.id);
          },
        });
      }
    }
  }

  getInitials(name?: string | null): string {
    if (!name || !name.trim()) return 'CL';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  loadSuggestions(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      this.closeSuggestions();
      return;
    }

    this.suggestionsSubscription?.unsubscribe();
    const reqId = ++this.currentSuggestionRequestId;

    this.suggestionsLoading.set(true);
    this.suggestionsError.set(null);
    this.highlightedIndex.set(-1);
    this.showSuggestions.set(true);

    const category = this.selectedCategory() === 'Toutes' ? undefined : this.selectedCategory() || undefined;
    const tag = this.selectedTag().trim() || undefined;

    this.suggestionsSubscription = this.postService
      .getPosts({
        page: 1,
        limit: 5,
        query: trimmed,
        category,
        tags: tag,
        mode: 'suggest',
      })
      .subscribe({
        next: (pageData) => {
          if (reqId !== this.currentSuggestionRequestId) {
            return;
          }
          this.suggestionsLoading.set(false);
          this.suggestions.set(pageData.docs || pageData.items || []);
        },
        error: (err) => {
          if (reqId !== this.currentSuggestionRequestId) {
            return;
          }
          this.suggestionsLoading.set(false);
          this.suggestionsError.set(
            err.error?.message || 'Erreur lors de la recherche de suggestions.'
          );
        },
      });
  }

  closeSuggestions(): void {
    this.showSuggestions.set(false);
    this.suggestionsSubscription?.unsubscribe();
    this.currentSuggestionRequestId++;
    this.suggestions.set([]);
    this.suggestionsLoading.set(false);
    this.suggestionsError.set(null);
    this.highlightedIndex.set(-1);
  }

  openPost(postId: string): void {
    this.closeSuggestions();
    this.router.navigate(['/posts', postId]);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSuggestions();
    } else if (event.key === 'ArrowDown') {
      if (this.showSuggestions() && this.suggestions().length > 0) {
        event.preventDefault();
        const next = (this.highlightedIndex() + 1) % this.suggestions().length;
        this.highlightedIndex.set(next);
      }
    } else if (event.key === 'ArrowUp') {
      if (this.showSuggestions() && this.suggestions().length > 0) {
        event.preventDefault();
        const prev =
          this.highlightedIndex() <= 0
            ? this.suggestions().length - 1
            : this.highlightedIndex() - 1;
        this.highlightedIndex.set(prev);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.onSubmitSearch();
    }
  }

  onSubmitSearch(): void {
    if (
      this.showSuggestions() &&
      this.highlightedIndex() >= 0 &&
      this.highlightedIndex() < this.suggestions().length
    ) {
      const selected = this.suggestions()[this.highlightedIndex()];
      this.openPost(selected.id);
      return;
    }

    this.closeSuggestions();
    const query = this.searchControl.value.trim();
    this.appliedQuery.set(query);
    if (query && this.sortCriteria() === 'date-desc') {
      this.sortCriteria.set('relevance');
    }
    this.loadPosts(1);
  }

  loadPosts(page: number): void {
    this.postsSubscription?.unsubscribe();
    const requestId = ++this.currentRequestId;

    this.loading.set(true);
    this.error.set(null);

    const category = this.selectedCategory() === 'Toutes' ? '' : this.selectedCategory();
    const query = this.appliedQuery().trim();
    const tag = this.selectedTag().trim();
    const authorId = this.selectedAuthorId().trim();
    const authorName = !authorId ? this.selectedAuthorName().trim() : '';

    const params: PostFilterParams = {
      page,
      limit: this.pageSize(),
      category: category || undefined,
      query: query || undefined,
      tags: tag || undefined,
      sort: this.sortCriteria(),
      ...(authorId ? { author: authorId } : {}),
      ...(authorName ? { authorName } : {}),
    };

    this.postsSubscription = this.postService
      .getPosts(params)
      .subscribe({
        next: (pageData) => {
          if (requestId !== this.currentRequestId) {
            return;
          }
          const list = pageData.docs || pageData.items || [];
          this.posts.set(list);
          this.preloadProtectedCovers(list);
          this.currentPage.set(pageData.page || page);
          this.totalPages.set(pageData.totalPages || pageData.pages || 1);
          this.totalDocs.set(pageData.totalDocs ?? pageData.total ?? 0);
          this.loading.set(false);
        },
        error: (err) => {
          if (requestId !== this.currentRequestId) {
            return;
          }
          this.loading.set(false);
          this.error.set(
            err.error?.message || 'Erreur lors du chargement des créations.'
          );
        },
      });
  }

  selectCategory(cat: string): void {
    const newCat = cat === 'Toutes' ? '' : cat;
    if (this.selectedCategory() !== newCat) {
      this.closeSuggestions();
      this.selectedCategory.set(newCat);
      this.loadPosts(1);
    }
  }

  selectTag(tag: string): void {
    this.closeSuggestions();
    const trimmed = tag.trim().toLowerCase();
    if (this.selectedTag() === trimmed) {
      this.selectedTag.set('');
    } else {
      this.selectedTag.set(trimmed);
    }
    this.loadPosts(1);
  }

  clearTag(): void {
    if (this.selectedTag()) {
      this.closeSuggestions();
      this.selectedTag.set('');
      this.loadPosts(1);
    }
  }

  clearSearch(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.closeSuggestions();
    if (this.sortCriteria() === 'relevance') {
      this.sortCriteria.set('date-desc');
    }
    if (this.appliedQuery()) {
      this.appliedQuery.set('');
      this.loadPosts(1);
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages() && !this.loading() && page !== this.currentPage()) {
      this.loadPosts(page);
    }
  }
}

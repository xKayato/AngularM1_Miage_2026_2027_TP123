import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { PostService } from '../../shared/services/post.service';
import { PostPreview } from '../../shared/models/post.model';

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
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  private searchSubscription?: Subscription;
  private postsSubscription?: Subscription;
  private suggestionsSubscription?: Subscription;
  private currentRequestId = 0;
  private currentSuggestionRequestId = 0;

  // Catalogue
  readonly posts = signal<PostPreview[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalDocs = signal<number>(0);

  readonly selectedCategory = signal<string>('');
  readonly selectedTag = signal<string>('');
  readonly appliedQuery = signal<string>('');

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
    this.loadPosts(1);

    this.searchSubscription = this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.loadSuggestions(query);
      });
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.postsSubscription?.unsubscribe();
    this.suggestionsSubscription?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showSuggestions() && !this.elementRef.nativeElement.contains(event.target)) {
      this.closeSuggestions();
    }
  }

  setSortCriteria(criteria: SortCriteria): void {
    if (this.sortCriteria() !== criteria) {
      this.sortCriteria.set(criteria);
      this.loadPosts(1);
    }
  }

  readonly failedAvatars = signal<Record<string, boolean>>({});

  isAvatarFailed(id: string): boolean {
    return Boolean(this.failedAvatars()[id]);
  }

  markAvatarFailed(id: string): void {
    this.failedAvatars.update((map) => ({ ...map, [id]: true }));
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

    this.postsSubscription = this.postService
      .getPosts({
        page,
        limit: 9,
        category: category || undefined,
        query: query || undefined,
        tags: tag || undefined,
        sort: this.sortCriteria(),
      })
      .subscribe({
        next: (pageData) => {
          if (requestId !== this.currentRequestId) {
            return;
          }
          this.posts.set(pageData.docs || pageData.items || []);
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

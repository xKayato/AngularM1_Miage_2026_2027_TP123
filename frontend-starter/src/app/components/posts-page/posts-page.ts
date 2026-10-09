import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PostService } from '../../shared/services/post.service';
import { PostPreview } from '../../shared/models/post.model';

@Component({
  selector: 'app-posts-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './posts-page.html',
  styleUrls: ['./posts-page.css'],
})
export class PostsPageComponent implements OnInit {
  private readonly postService = inject(PostService);

  readonly posts = signal<PostPreview[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalDocs = signal<number>(0);

  readonly selectedCategory = signal<string>('');
  readonly selectedTag = signal<string>('');
  readonly searchQuery = signal<string>('');

  readonly categories = [
    'Toutes',
    'Lego',
    'Papercraft',
    'Origami',
    'Musique',
    'Modèles 3D',
    'Autre',
  ];

  ngOnInit(): void {
    this.loadPosts(1);
  }

  loadPosts(page: number): void {
    this.loading.set(true);
    this.error.set(null);

    const category = this.selectedCategory() === 'Toutes' ? '' : this.selectedCategory();
    const query = this.searchQuery().trim();
    const tag = this.selectedTag().trim();

    this.postService
      .getPosts({
        page,
        limit: 9,
        category: category || undefined,
        query: query || undefined,
        tags: tag || undefined,
      })
      .subscribe({
        next: (pageData) => {
          this.posts.set(pageData.docs || pageData.items || []);
          this.currentPage.set(pageData.page || 1);
          this.totalPages.set(pageData.totalPages || pageData.pages || 1);
          this.totalDocs.set(pageData.totalDocs || pageData.total || 0);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err.error?.message || 'Erreur lors du chargement des créations.'
          );
        },
      });
  }

  onFilterChange(): void {
    this.loadPosts(1);
  }

  selectTag(tag: string): void {
    const trimmed = tag.trim().toLowerCase();
    if (this.selectedTag() === trimmed) {
      this.selectedTag.set('');
    } else {
      this.selectedTag.set(trimmed);
    }
    this.loadPosts(1);
  }

  clearTag(): void {
    this.selectedTag.set('');
    this.loadPosts(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages() && !this.loading()) {
      this.loadPosts(page);
    }
  }
}

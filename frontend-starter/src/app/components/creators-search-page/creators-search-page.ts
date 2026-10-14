import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { CreatorService } from '../../shared/services/creator.service';
import { CreatorSummary } from '../../shared/models/creator.model';

@Component({
  selector: 'app-creators-search-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './creators-search-page.html',
  styleUrls: ['./creators-search-page.css'],
})
export class CreatorsSearchPageComponent implements OnInit, OnDestroy {
  private readonly creatorService = inject(CreatorService);

  readonly searchControl = new FormControl('', { nonNullable: true });
  private searchSubscription?: Subscription;

  readonly creators = signal<CreatorSummary[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalDocs = signal<number>(0);

  ngOnInit(): void {
    this.loadCreators(1);

    this.searchSubscription = this.searchControl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => {
        this.loadCreators(1);
      });
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
  }

  loadCreators(page: number): void {
    this.loading.set(true);
    this.error.set(null);

    const query = this.searchControl.value.trim() || undefined;

    this.creatorService.getCreators({ page, limit: 12, query }).subscribe({
      next: (pageData) => {
        this.creators.set(pageData.docs || pageData.items || []);
        this.currentPage.set(pageData.page || page);
        this.totalPages.set(pageData.totalPages || pageData.pages || 1);
        this.totalDocs.set(pageData.totalDocs ?? pageData.total ?? 0);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err.error?.message || 'Impossible de charger la liste des créateurs.'
        );
      },
    });
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages() && !this.loading() && page !== this.currentPage()) {
      this.loadCreators(page);
    }
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
}

import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { PostService } from '../../shared/services/post.service';
import { CreatorService } from '../../shared/services/creator.service';
import { FollowItem, SubscriptionItem } from '../../shared/models/creator.model';

@Component({
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly postService = inject(PostService);
  private readonly creatorService = inject(CreatorService);

  // Profile form state
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly success = signal('');
  readonly error = signal('');

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  // Projects metrics state
  readonly loadingMetrics = signal(false);
  readonly metricsError = signal('');
  readonly totalPostsCount = signal<number | null>(null);
  readonly publishedPostsCount = signal<number | null>(null);
  readonly draftsPostsCount = signal<number | null>(null);
  readonly archivedPostsCount = signal<number | null>(null);

  // Followed creators state
  readonly loadingFollows = signal(false);
  readonly followsError = signal('');
  readonly follows = signal<FollowItem[]>([]);
  readonly totalFollows = signal(0);
  readonly unfollowingId = signal<string | null>(null);

  // Active subscriptions state
  readonly loadingSubscriptions = signal(false);
  readonly subscriptionsError = signal('');
  readonly subscriptions = signal<SubscriptionItem[]>([]);
  readonly totalSubscriptions = signal(0);

  /** Checks if the form has unchanged content compared to currentUser */
  isUnchanged(): boolean {
    const currentName = this.auth.currentUser()?.name?.trim() ?? '';
    const formName = this.form.controls.name.value.trim();
    return currentName === formName;
  }

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.form.setValue({ name: user.name });
    } else {
      this.load();
    }

    this.loadDashboardData();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.auth.profile().subscribe({
      next: (user) => {
        this.loading.set(false);
        this.form.setValue({ name: user.name });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.error.set(err.error?.message ?? 'Impossible de charger le profil');
        } else {
          this.error.set('Erreur lors du chargement du profil');
        }
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.submitting() || this.isUnchanged()) {
      return;
    }

    this.submitting.set(true);
    this.success.set('');
    this.error.set('');

    const newName = this.form.controls.name.value.trim();
    this.auth.update(newName).subscribe({
      next: (updatedUser) => {
        this.submitting.set(false);
        this.form.setValue({ name: updatedUser.name });
        this.success.set('Profil mis à jour avec succès !');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (err instanceof HttpErrorResponse) {
          this.error.set(err.error?.message ?? 'Impossible de mettre à jour le profil');
        } else {
          this.error.set('Erreur lors de la mise à jour');
        }
      },
    });
  }

  loadDashboardData(): void {
    this.loadMetrics();
    this.loadFollows();
    this.loadSubscriptions();
  }

  /**
   * Charge les totaux de ses créations par statut avec des requêtes légères (limit: 1)
   */
  loadMetrics(): void {
    this.loadingMetrics.set(true);
    this.metricsError.set('');

    forkJoin({
      all: this.postService.getMyPosts({ page: 1, limit: 1, status: 'all' }),
      published: this.postService.getMyPosts({ page: 1, limit: 1, status: 'published' }),
      drafts: this.postService.getMyPosts({ page: 1, limit: 1, status: 'draft' }),
      archived: this.postService.getMyPosts({ page: 1, limit: 1, status: 'archived' }),
    }).subscribe({
      next: (res) => {
        this.loadingMetrics.set(false);
        this.totalPostsCount.set(res.all.totalDocs ?? res.all.total ?? 0);
        this.publishedPostsCount.set(res.published.totalDocs ?? res.published.total ?? 0);
        this.draftsPostsCount.set(res.drafts.totalDocs ?? res.drafts.total ?? 0);
        this.archivedPostsCount.set(res.archived.totalDocs ?? res.archived.total ?? 0);
      },
      error: () => {
        this.loadingMetrics.set(false);
        this.metricsError.set('Impossible de charger les métriques de créations.');
      },
    });
  }

  /**
   * Charge les créateurs suivis par l'utilisateur
   */
  loadFollows(): void {
    this.loadingFollows.set(true);
    this.followsError.set('');

    this.creatorService.getMyFollows({ page: 1, limit: 20 }).subscribe({
      next: (res) => {
        this.loadingFollows.set(false);
        this.follows.set(res.docs ?? res.items ?? []);
        this.totalFollows.set(res.totalDocs ?? res.total ?? 0);
      },
      error: () => {
        this.loadingFollows.set(false);
        this.followsError.set('Impossible de charger vos abonnements créateurs.');
      },
    });
  }

  /**
   * Cesse de suivre un créateur
   */
  unfollow(creatorId: string): void {
    if (this.unfollowingId()) return;

    this.unfollowingId.set(creatorId);
    this.creatorService.unfollow(creatorId).subscribe({
      next: () => {
        this.unfollowingId.set(null);
        this.follows.update((list) => list.filter((f) => f.creator.id !== creatorId));
        this.totalFollows.update((c) => Math.max(0, c - 1));
      },
      error: () => {
        this.unfollowingId.set(null);
      },
    });
  }

  /**
   * Charge les abonnements simulés actifs
   */
  loadSubscriptions(): void {
    this.loadingSubscriptions.set(true);
    this.subscriptionsError.set('');

    this.creatorService.getMySubscriptions({ page: 1, limit: 20 }).subscribe({
      next: (res) => {
        this.loadingSubscriptions.set(false);
        this.subscriptions.set(res.docs ?? res.items ?? []);
        this.totalSubscriptions.set(res.totalDocs ?? res.total ?? 0);
      },
      error: () => {
        this.loadingSubscriptions.set(false);
        this.subscriptionsError.set('Impossible de charger vos abonnements VIP.');
      },
    });
  }
}

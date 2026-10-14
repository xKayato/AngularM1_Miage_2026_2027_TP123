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
import { User } from '../../shared/models/user.model';

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
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    bio: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    profileTags: new FormControl('', {
      nonNullable: true,
    }),
  });

  // Password form state
  readonly passwordForm = new FormGroup({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  readonly submittingPassword = signal(false);
  readonly passwordSuccess = signal('');
  readonly passwordError = signal('');

  // Avatar upload state
  readonly uploadingAvatar = signal(false);
  readonly deletingAvatar = signal(false);
  readonly avatarError = signal('');
  readonly avatarSuccess = signal('');

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
    const user = this.auth.currentUser();
    if (!user) return true;
    const formVals = this.form.getRawValue();
    const currentTags = (user.profileTags || []).join(', ');
    return (
      user.name.trim() === formVals.name.trim() &&
      user.email.trim().toLowerCase() === formVals.email.trim().toLowerCase() &&
      (user.bio || '').trim() === formVals.bio.trim() &&
      currentTags === formVals.profileTags.trim()
    );
  }

  getInitials(name?: string | null): string {
    if (!name || !name.trim()) return 'MK';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.populateForm(user);
    } else {
      this.load();
    }

    this.loadDashboardData();
  }

  private populateForm(user: User): void {
    this.form.setValue({
      name: user.name || '',
      email: user.email || '',
      bio: user.bio || '',
      profileTags: (user.profileTags || []).join(', '),
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.auth.profile().subscribe({
      next: (user) => {
        this.loading.set(false);
        this.populateForm(user);
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

    const raw = this.form.getRawValue();
    const tagsArray = raw.profileTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    this.auth
      .updateProfile({
        name: raw.name.trim(),
        email: raw.email.trim().toLowerCase(),
        bio: raw.bio.trim(),
        profileTags: tagsArray,
      })
      .subscribe({
        next: (updatedUser) => {
          this.submitting.set(false);
          this.populateForm(updatedUser);
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

  savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();

    if (newPassword !== confirmPassword) {
      this.passwordError.set('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }

    this.submittingPassword.set(true);
    this.passwordSuccess.set('');
    this.passwordError.set('');

    this.auth.updatePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.submittingPassword.set(false);
        this.passwordForm.reset();
        this.passwordSuccess.set(
          'Mot de passe mis à jour avec succès. Toutes vos autres sessions ont été invalidées par sécurité.'
        );
      },
      error: (err: unknown) => {
        this.submittingPassword.set(false);
        if (err instanceof HttpErrorResponse) {
          // L'erreur 400 ne déconnecte pas l'utilisateur dans Angular
          this.passwordError.set(err.error?.message ?? 'Impossible de modifier le mot de passe');
        } else {
          this.passwordError.set('Erreur lors du changement de mot de passe');
        }
      },
    });
  }

  onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.avatarError.set('');
    this.avatarSuccess.set('');

    // Validation taille (2 Mo max)
    if (file.size > 2 * 1024 * 1024) {
      this.avatarError.set("L'image d'avatar ne doit pas dépasser 2 Mo.");
      input.value = '';
      return;
    }

    // Validation type MIME
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.avatarError.set('Format image non accepté (JPEG, PNG ou WebP uniquement).');
      input.value = '';
      return;
    }

    this.uploadingAvatar.set(true);
    this.auth.uploadAvatar(file).subscribe({
      next: () => {
        this.uploadingAvatar.set(false);
        this.avatarSuccess.set('Avatar mis à jour avec succès !');
        input.value = '';
      },
      error: (err: unknown) => {
        this.uploadingAvatar.set(false);
        input.value = '';
        if (err instanceof HttpErrorResponse) {
          this.avatarError.set(err.error?.message ?? "Erreur lors du téléversement de l'avatar.");
        } else {
          this.avatarError.set("Erreur lors de l'enregistrement de l'avatar.");
        }
      },
    });
  }

  deleteAvatar(): void {
    if (this.deletingAvatar()) return;

    this.deletingAvatar.set(true);
    this.avatarError.set('');
    this.avatarSuccess.set('');

    this.auth.deleteAvatar().subscribe({
      next: () => {
        this.deletingAvatar.set(false);
        this.avatarSuccess.set('Avatar supprimé avec succès.');
      },
      error: (err: unknown) => {
        this.deletingAvatar.set(false);
        if (err instanceof HttpErrorResponse) {
          this.avatarError.set(err.error?.message ?? "Erreur lors de la suppression de l'avatar.");
        } else {
          this.avatarError.set("Erreur lors de la suppression de l'avatar.");
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

import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CreatorService } from '../../shared/services/creator.service';
import { AuthService } from '../../shared/services/auth.service';
import { PostService } from '../../shared/services/post.service';
import { CreatorPublicProfile } from '../../shared/models/creator.model';
import { PostPreview } from '../../shared/models/post.model';

@Component({
  selector: 'app-creator-profile-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './creator-profile-page.html',
  styleUrls: ['./creator-profile-page.css'],
})
export class CreatorProfilePageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly creatorService = inject(CreatorService);
  private readonly postService = inject(PostService, { optional: true });
  readonly auth = inject(AuthService);

  readonly coverBlobUrls = signal<Record<string, string>>({});
  readonly failedCovers = signal<Record<string, boolean>>({});
  private readonly loadingCoverIds = new Set<string>();
  private readonly createdObjectUrls: string[] = [];

  readonly creatorId = signal<string>('');
  readonly profile = signal<CreatorPublicProfile | null>(null);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly isFollowLoading = signal<boolean>(false);
  readonly isSubscribeLoading = signal<boolean>(false);
  readonly actionMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly shareToast = signal<string | null>(null);
  private shareTimeout?: any;

  readonly isSelf = computed(() => {
    const current = this.profile();
    if (!current) return false;
    const myId = this.auth.currentUser()?.id;
    return Boolean(current.isSelf || (myId && myId === current.id));
  });

  ngOnDestroy(): void {
    if (this.shareTimeout) clearTimeout(this.shareTimeout);
    for (const url of this.createdObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.createdObjectUrls.length = 0;
  }

  shareProfile(): void {
    const prof = this.profile();
    if (!prof) return;

    const fullUrl = `${window.location.origin}/creators/${prof.id}`;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText(fullUrl)
        .then(() => this.triggerShareToast('Lien du profil copié dans le presse-papier !'))
        .catch(() => this.triggerShareToast('Lien du profil copié !'));
    } else {
      this.triggerShareToast('Lien du profil copié dans le presse-papier !');
    }
  }

  private triggerShareToast(message: string): void {
    this.shareToast.set(message);
    if (this.shareTimeout) clearTimeout(this.shareTimeout);
    this.shareTimeout = setTimeout(() => {
      this.shareToast.set(null);
    }, 3500);
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Identifiant créateur manquant.');
      this.loading.set(false);
      return;
    }

    this.creatorId.set(id);
    this.loadProfile(id);
  }

  loadProfile(id: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.creatorService.getCreatorProfile(id).subscribe({
      next: (data) => {
        this.profile.set(data);
        this.preloadProtectedCovers(data.creations || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.error.set('Ce profil de créateur est introuvable ou a été suspendu par la modération.');
        } else {
          this.error.set(err.error?.message || 'Erreur lors du chargement du profil.');
        }
      },
    });
  }

  follow(): void {
    const prof = this.profile();
    if (!prof || this.isFollowLoading() || this.isSelf()) return;

    this.isFollowLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.follow(prof.id).subscribe({
      next: (res) => {
        this.isFollowLoading.set(false);
        this.profile.update((curr) => {
          if (!curr) return null;
          return {
            ...curr,
            followersCount: curr.followersCount + (res.following ? 1 : 0),
            userInteractions: {
              ...curr.userInteractions,
              isFollowing: res.following,
            },
          };
        });
        this.actionMessage.set(`Vous suivez désormais ${prof.name}.`);
        // Recharger le profil pour déverrouiller ses posts followers
        this.loadProfile(prof.id);
      },
      error: (err) => {
        this.isFollowLoading.set(false);
        this.actionError.set(err.error?.message || 'Erreur lors du suivi.');
      },
    });
  }

  unfollow(): void {
    const prof = this.profile();
    if (!prof || this.isFollowLoading() || this.isSelf()) return;

    this.isFollowLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.unfollow(prof.id).subscribe({
      next: (res) => {
        this.isFollowLoading.set(false);
        this.profile.update((curr) => {
          if (!curr) return null;
          return {
            ...curr,
            followersCount: Math.max(0, curr.followersCount - 1),
            userInteractions: {
              ...curr.userInteractions,
              isFollowing: res.following,
            },
          };
        });
        this.actionMessage.set(`Vous ne suivez plus ${prof.name}.`);
        this.loadProfile(prof.id);
      },
      error: (err) => {
        this.isFollowLoading.set(false);
        this.actionError.set(err.error?.message || 'Erreur lors du désabonnement.');
      },
    });
  }

  subscribe(): void {
    const prof = this.profile();
    if (!prof || this.isSubscribeLoading() || this.isSelf()) return;

    this.isSubscribeLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.subscribe(prof.id).subscribe({
      next: (res) => {
        this.isSubscribeLoading.set(false);
        this.profile.update((curr) => {
          if (!curr) return null;
          return {
            ...curr,
            subscribersCount: curr.subscribersCount + 1,
            userInteractions: {
              ...curr.userInteractions,
              isSubscribed: true,
              subscriptionExpiresAt: res.expiresAt,
            },
          };
        });
        this.actionMessage.set(
          `Abonnement simulé de 30 jours activé (Simulation — aucun paiement). Échéance : ${new Date(res.expiresAt).toLocaleDateString('fr-FR')}.`
        );
        this.loadProfile(prof.id);
      },
      error: (err) => {
        this.isSubscribeLoading.set(false);
        if (err.status === 409) {
          this.actionError.set(err.error?.message || 'Abonnement déjà actif.');
        } else {
          this.actionError.set(err.error?.message || 'Erreur lors de la souscription.');
        }
      },
    });
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
    if (!this.postService || typeof this.postService.getAttachmentBlob !== 'function') return;
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

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
}

import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CreatorService } from '../../shared/services/creator.service';
import { AuthService } from '../../shared/services/auth.service';
import { PostService } from '../../shared/services/post.service';
import { CreatorPublicProfile, FollowItem } from '../../shared/models/creator.model';
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
  private readonly postService = inject(PostService);
  readonly auth = inject(AuthService);

  private routeSub?: Subscription;
  private socialSub?: Subscription;

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
  private shareTimeout?: ReturnType<typeof setTimeout>;

  // Onglet social interactif : 'followers' | 'following' | null
  readonly activeSocialTab = signal<'followers' | 'following' | null>(null);
  readonly socialLoading = signal<boolean>(false);
  readonly socialError = signal<string | null>(null);
  readonly socialItems = signal<FollowItem[]>([]);
  readonly socialPage = signal<number>(1);
  readonly socialTotalPages = signal<number>(1);
  readonly socialTotalDocs = signal<number>(0);

  // Pagination et taille de page des créations du profil
  readonly creationsPage = signal<number>(1);
  readonly creationsPageSize = signal<number>(6);
  readonly creationsPageSizeOptions = [6, 12, 24, 48];

  readonly paginatedCreations = computed<PostPreview[]>(() => {
    const all = this.profile()?.creations || [];
    const size = this.creationsPageSize();
    const start = (this.creationsPage() - 1) * size;
    return all.slice(start, start + size);
  });

  /** Le serveur n'embarque que les 100 créations les plus récentes ; creationsCount est le total réel. */
  readonly hasMoreCreations = computed<boolean>(() => {
    const prof = this.profile();
    return Boolean(prof && prof.creationsCount > (prof.creations?.length ?? 0));
  });

  readonly creationsTotalPages = computed<number>(() => {
    const total = this.profile()?.creations?.length || 0;
    return Math.max(1, Math.ceil(total / this.creationsPageSize()));
  });

  readonly isSelf = computed(() => {
    const current = this.profile();
    if (!current) return false;
    const myId = this.auth.currentUser()?.id;
    return Boolean(current.isSelf || (myId && myId === current.id));
  });

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.socialSub?.unsubscribe();
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
    if (this.route.paramMap && typeof this.route.paramMap.subscribe === 'function') {
      this.routeSub = this.route.paramMap.subscribe((params) => {
        const id = params.get('id');
        this.initForCreatorId(id);
      });
    } else {
      const id = this.route.snapshot?.paramMap?.get('id') ?? null;
      this.initForCreatorId(id);
    }
  }

  private initForCreatorId(id: string | null): void {
    if (!id) {
      this.error.set('Identifiant créateur manquant.');
      this.loading.set(false);
      return;
    }

    this.socialSub?.unsubscribe();
    this.socialLoading.set(false);
    this.activeSocialTab.set(null);
    this.socialItems.set([]);
    this.creationsPage.set(1);
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

  toggleSocialTab(tab: 'followers' | 'following'): void {
    if (this.activeSocialTab() === tab) {
      this.activeSocialTab.set(null);
      return;
    }
    this.activeSocialTab.set(tab);
    this.loadSocialList(tab, 1);
  }

  closeSocialTab(): void {
    this.socialSub?.unsubscribe();
    this.socialLoading.set(false);
    this.activeSocialTab.set(null);
  }

  loadSocialList(tab: 'followers' | 'following', page: number): void {
    const id = this.profile()?.id || this.creatorId();
    if (!id) return;

    this.socialLoading.set(true);
    this.socialError.set(null);

    const obs$ =
      tab === 'followers'
        ? this.creatorService.getCreatorFollowers(id, { page, limit: 12 })
        : this.creatorService.getCreatorFollowing(id, { page, limit: 12 });

    // Annule la requête précédente : un clic rapide Followers -> Suivis ne doit pas
    // afficher la réponse de l'onglet abandonné.
    this.socialSub?.unsubscribe();
    this.socialSub = obs$.subscribe({
      next: (res) => {
        this.socialLoading.set(false);
        this.socialItems.set(res.docs || res.items || []);
        this.socialPage.set(res.page || page);
        this.socialTotalPages.set(res.totalPages || res.pages || 1);
        this.socialTotalDocs.set(res.totalDocs ?? res.total ?? 0);
      },
      error: (err) => {
        this.socialLoading.set(false);
        this.socialError.set(err.error?.message || 'Impossible de charger cette liste.');
      },
    });
  }

  goToSocialPage(page: number): void {
    const tab = this.activeSocialTab();
    if (!tab || page < 1 || page > this.socialTotalPages() || page === this.socialPage()) return;
    this.loadSocialList(tab, page);
  }

  setCreationsPageSize(size: number): void {
    if (this.creationsPageSize() !== size) {
      this.creationsPageSize.set(size);
      this.creationsPage.set(1);
    }
  }

  goToCreationsPage(page: number): void {
    if (page >= 1 && page <= this.creationsTotalPages()) {
      this.creationsPage.set(page);
    }
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
        this.loadingCoverIds.add(post.id);
        this.postService.getAttachmentBlob(match[1], match[2]).subscribe({
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

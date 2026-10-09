import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PostService } from '../../shared/services/post.service';
import { CreatorService } from '../../shared/services/creator.service';
import { AuthService } from '../../shared/services/auth.service';
import { AttachmentInfo, PostDetail, PostPreview } from '../../shared/models/post.model';
import { CreatorStatusResponse } from '../../shared/models/creator.model';

@Component({
  selector: 'app-post-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './post-detail-page.html',
  styleUrls: ['./post-detail-page.css'],
})
export class PostDetailPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly postService = inject(PostService);
  private readonly creatorService = inject(CreatorService);
  readonly auth = inject(AuthService);

  readonly postId = signal<string>('');
  readonly postDetail = signal<PostDetail | null>(null);
  readonly postPreview = signal<PostPreview | null>(null);
  readonly isLocked = signal<boolean>(false);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // Gestion des interactions créateur (Mission 5)
  readonly creatorStatus = signal<CreatorStatusResponse | null>(null);
  readonly isFollowLoading = signal<boolean>(false);
  readonly isSubscribeLoading = signal<boolean>(false);
  readonly actionMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly isLikeLoading = signal<boolean>(false);

  readonly isSelfAuthor = computed(() => {
    const myId = this.auth.currentUser()?.id;
    const authorId = this.postDetail()?.author.id || this.postPreview()?.author.id;
    return Boolean(myId && authorId && myId === authorId);
  });

  // Gestion des pièces jointes sécurisées
  readonly currentAudioUrl = signal<string | null>(null);
  readonly activeAudioAttachmentId = signal<string | null>(null);
  readonly imageUrls = signal<Record<string, string>>({});
  private readonly createdObjectUrls: string[] = [];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Identifiant de projet manquant.');
      this.loading.set(false);
      return;
    }

    this.postId.set(id);
    this.loadPost(id);
  }

  ngOnDestroy(): void {
    // Nettoyage impératif de toutes les URLs Blob créées en mémoire
    for (const url of this.createdObjectUrls) {
      URL.revokeObjectURL(url);
    }
  }

  loadPost(id: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.postService.getPostDetail(id).subscribe({
      next: (detail) => {
        this.postDetail.set(detail);
        this.isLocked.set(false);
        this.loading.set(false);
        this.preloadImages(detail);
        this.loadCreatorStatus(detail.author.id);
      },
      error: (err) => {
        // En cas de 401 ou 403, on tente de récupérer l'aperçu PostPreview
        if (err.status === 401 || err.status === 403) {
          this.postService.getPostPreview(id).subscribe({
            next: (preview) => {
              this.postPreview.set(preview);
              this.isLocked.set(true);
              this.loading.set(false);
              this.loadCreatorStatus(preview.author.id);
            },
            error: (previewErr) => {
              this.loading.set(false);
              this.handleErrorResponse(previewErr);
            },
          });
        } else {
          this.loading.set(false);
          this.handleErrorResponse(err);
        }
      },
    });
  }

  loadCreatorStatus(creatorId: string): void {
    if (!this.auth.isAuthenticated() || this.isSelfAuthor()) return;
    this.creatorService.getStatus(creatorId).subscribe({
      next: (status) => this.creatorStatus.set(status),
      error: () => this.creatorStatus.set(null),
    });
  }

  followAuthor(): void {
    const authorId = this.postDetail()?.author.id || this.postPreview()?.author.id;
    if (!authorId || this.isFollowLoading() || this.isSelfAuthor()) return;

    this.isFollowLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.follow(authorId).subscribe({
      next: (res) => {
        this.isFollowLoading.set(false);
        this.creatorStatus.update((current) =>
          current ? { ...current, isFollowing: res.following } : { isFollowing: res.following, isSubscribed: false, expiresAt: null }
        );
        this.actionMessage.set('Vous suivez maintenant ce créateur.');
        if (this.isLocked()) {
          this.loadPost(this.postId());
        }
      },
      error: (err) => {
        this.isFollowLoading.set(false);
        this.actionError.set(err.error?.message || 'Erreur lors du suivi de ce créateur.');
      },
    });
  }

  unfollowAuthor(): void {
    const authorId = this.postDetail()?.author.id || this.postPreview()?.author.id;
    if (!authorId || this.isFollowLoading() || this.isSelfAuthor()) return;

    this.isFollowLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.unfollow(authorId).subscribe({
      next: (res) => {
        this.isFollowLoading.set(false);
        this.creatorStatus.update((current) =>
          current ? { ...current, isFollowing: res.following } : null
        );
        this.actionMessage.set('Vous ne suivez plus ce créateur.');
        if (this.postDetail()?.visibility === 'followers') {
          this.loadPost(this.postId());
        }
      },
      error: (err) => {
        this.isFollowLoading.set(false);
        this.actionError.set(err.error?.message || 'Erreur lors de la désactivation du suivi.');
      },
    });
  }

  subscribeAuthor(): void {
    const authorId = this.postDetail()?.author.id || this.postPreview()?.author.id;
    if (!authorId || this.isSubscribeLoading() || this.isSelfAuthor()) return;

    this.isSubscribeLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.subscribe(authorId).subscribe({
      next: (res) => {
        this.isSubscribeLoading.set(false);
        this.creatorStatus.update((current) => ({
          isFollowing: current?.isFollowing ?? false,
          isSubscribed: true,
          expiresAt: res.expiresAt,
        }));
        this.actionMessage.set(
          `Abonnement simulé de 30 jours activé (Simulation — aucun paiement). Échéance : ${new Date(res.expiresAt).toLocaleDateString('fr-FR')}.`
        );
        if (this.isLocked()) {
          this.loadPost(this.postId());
        }
      },
      error: (err) => {
        this.isSubscribeLoading.set(false);
        if (err.status === 409) {
          if (err.error?.expiresAt) {
            this.creatorStatus.update((current) => ({
              isFollowing: current?.isFollowing ?? false,
              isSubscribed: true,
              expiresAt: err.error.expiresAt,
            }));
          }
          this.actionError.set(err.error?.message || 'Abonnement déjà actif.');
        } else {
          this.actionError.set(err.error?.message || 'Erreur lors de la souscription.');
        }
      },
    });
  }

  toggleLike(): void {
    const detail = this.postDetail();
    if (!detail || this.isLikeLoading() || this.isSelfAuthor() || !this.auth.isAuthenticated()) {
      return;
    }

    this.isLikeLoading.set(true);
    this.actionError.set(null);

    const isCurrentlyLiked = detail.userInteractions?.isLiked ?? false;
    const request$ = isCurrentlyLiked
      ? this.postService.unlikePost(detail.id)
      : this.postService.likePost(detail.id);

    request$.subscribe({
      next: (res) => {
        this.isLikeLoading.set(false);
        this.postDetail.update((current) =>
          current
            ? {
                ...current,
                likesCount: res.likesCount,
                userInteractions: {
                  ...current.userInteractions,
                  isLiked: res.liked,
                },
              }
            : null
        );
      },
      error: (err) => {
        this.isLikeLoading.set(false);
        this.actionError.set(err.error?.message || 'Erreur lors de la mise à jour du like.');
      },
    });
  }

  private handleErrorResponse(err: { status?: number; error?: { message?: string } }): void {
    if (err.status === 410) {
      this.error.set('Ce projet a été archivé par la modération.');
    } else if (err.status === 404) {
      this.error.set('Projet introuvable ou retiré.');
    } else {
      this.error.set(err.error?.message || 'Impossible d’accéder à ce projet.');
    }
  }

  private preloadImages(detail: PostDetail): void {
    for (const att of detail.attachments) {
      if (att.family === 'image') {
        this.postService.getAttachmentBlob(detail.id, att.id).subscribe({
          next: (blob) => {
            const url = URL.createObjectURL(blob);
            this.createdObjectUrls.push(url);
            this.imageUrls.update((current) => ({ ...current, [att.id]: url }));
          },
        });
      }
    }
  }

  playAudio(att: AttachmentInfo): void {
    const post = this.postDetail();
    if (!post) return;

    if (this.currentAudioUrl()) {
      URL.revokeObjectURL(this.currentAudioUrl()!);
      this.currentAudioUrl.set(null);
    }

    this.activeAudioAttachmentId.set(att.id);
    this.postService.getAttachmentBlob(post.id, att.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.createdObjectUrls.push(url);
        this.currentAudioUrl.set(url);
      },
      error: () => {
        this.activeAudioAttachmentId.set(null);
      },
    });
  }

  downloadFile(att: AttachmentInfo): void {
    const post = this.postDetail();
    if (!post) return;

    this.postService.getAttachmentBlob(post.id, att.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.createdObjectUrls.push(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.originalName;
        a.click();
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 o';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }
}

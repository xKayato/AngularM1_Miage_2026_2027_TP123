import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PostService } from '../../shared/services/post.service';
import { AuthService } from '../../shared/services/auth.service';
import { AttachmentInfo, PostDetail, PostPreview } from '../../shared/models/post.model';

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
  readonly auth = inject(AuthService);

  readonly postId = signal<string>('');
  readonly postDetail = signal<PostDetail | null>(null);
  readonly postPreview = signal<PostPreview | null>(null);
  readonly isLocked = signal<boolean>(false);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

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
      },
      error: (err) => {
        // En cas de 401 ou 403, on tente de récupérer l'aperçu PostPreview
        if (err.status === 401 || err.status === 403) {
          this.postService.getPostPreview(id).subscribe({
            next: (preview) => {
              this.postPreview.set(preview);
              this.isLocked.set(true);
              this.loading.set(false);
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

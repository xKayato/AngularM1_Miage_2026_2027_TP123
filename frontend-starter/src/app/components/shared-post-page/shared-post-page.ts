import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PostService } from '../../shared/services/post.service';
import { AttachmentInfo, PostDetail } from '../../shared/models/post.model';

@Component({
  selector: 'app-shared-post-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './shared-post-page.html',
  styleUrls: ['./shared-post-page.css'],
})
export class SharedPostPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly postService = inject(PostService);

  readonly shareToken = signal<string>('');
  readonly postDetail = signal<PostDetail | null>(null);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // Gestion des pièces jointes sécurisées
  readonly currentAudioUrl = signal<string | null>(null);
  readonly activeAudioAttachmentId = signal<string | null>(null);
  readonly imageUrls = signal<Record<string, string>>({});
  private readonly createdObjectUrls: string[] = [];

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Jeton secret de partage manquant.');
      this.loading.set(false);
      return;
    }

    this.shareToken.set(token);
    this.loadSharedPost(token);
  }

  ngOnDestroy(): void {
    for (const url of this.createdObjectUrls) {
      URL.revokeObjectURL(url);
    }
  }

  loadSharedPost(token: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.postService.getSharedPost(token).subscribe({
      next: (detail) => {
        this.postDetail.set(detail);
        this.loading.set(false);
        this.preloadImages(detail, token);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 410) {
          this.error.set('Ce lien de partage est invalide, révoqué ou a expiré.');
        } else if (err.status === 404) {
          this.error.set('Projet introuvable.');
        } else {
          this.error.set(
            err.error?.message || 'Impossible d’accéder à ce projet partagé.'
          );
        }
      },
    });
  }

  private preloadImages(detail: PostDetail, token: string): void {
    for (const att of detail.attachments) {
      if (att.family === 'image') {
        this.postService.getAttachmentBlob(detail.id, att.id, token).subscribe({
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
    const token = this.shareToken();
    if (!post) return;

    if (this.currentAudioUrl()) {
      URL.revokeObjectURL(this.currentAudioUrl()!);
      this.currentAudioUrl.set(null);
    }

    this.activeAudioAttachmentId.set(att.id);
    this.postService.getAttachmentBlob(post.id, att.id, token).subscribe({
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
    const token = this.shareToken();
    if (!post) return;

    this.postService.getAttachmentBlob(post.id, att.id, token).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.createdObjectUrls.push(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.originalName;
        a.rel = 'noreferrer';
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

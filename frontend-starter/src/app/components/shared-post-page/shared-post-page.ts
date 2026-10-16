import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PostService } from '../../shared/services/post.service';
import { AuthService } from '../../shared/services/auth.service';
import { AttachmentInfo, PostComment, PostDetail } from '../../shared/models/post.model';

@Component({
  selector: 'app-shared-post-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './shared-post-page.html',
  styleUrls: ['./shared-post-page.css'],
})
export class SharedPostPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly postService = inject(PostService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly auth = inject(AuthService);

  readonly shareToken = signal<string>('');
  readonly postDetail = signal<PostDetail | null>(null);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // Gestion des commentaires sécurisés (Mission 4)
  readonly comments = signal<PostComment[]>([]);
  readonly loadingComments = signal<boolean>(false);
  readonly commentText = signal<string>('');
  readonly isPostingComment = signal<boolean>(false);
  readonly commentError = signal<string | null>(null);
  readonly isDeletingCommentId = signal<string | null>(null);
  readonly failedAvatars = signal<Set<string>>(new Set<string>());

  markAvatarFailed(id: string): void {
    const current = new Set(this.failedAvatars());
    current.add(id);
    this.failedAvatars.set(current);
  }

  isAvatarFailed(id: string): boolean {
    return this.failedAvatars().has(id);
  }

  // Gestion du lecteur PDF natif et sécurisé (Mission 4)
  readonly activePdfAttachment = signal<AttachmentInfo | null>(null);
  readonly safePdfBlobUrl = signal<SafeResourceUrl | null>(null);
  readonly isPdfLoading = signal<boolean>(false);

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
        this.loadComments(detail.id, token);
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

  viewPdf(att: AttachmentInfo): void {
    const detail = this.postDetail();
    const token = this.shareToken();
    if (!detail || att.family !== 'pdf') return;

    this.activePdfAttachment.set(att);
    this.safePdfBlobUrl.set(null);
    this.isPdfLoading.set(true);

    this.postService.getAttachmentBlob(detail.id, att.id, token).subscribe({
      next: (blob) => {
        const blobUrl = URL.createObjectURL(blob);
        this.createdObjectUrls.push(blobUrl);
        this.safePdfBlobUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl));
        this.isPdfLoading.set(false);
      },
      error: () => {
        this.isPdfLoading.set(false);
      },
    });
  }

  closePdfViewer(): void {
    this.activePdfAttachment.set(null);
    this.safePdfBlobUrl.set(null);
  }

  loadComments(postId: string, token: string): void {
    this.loadingComments.set(true);
    this.postService.getComments(postId, token).subscribe({
      next: (comments) => {
        this.comments.set(comments);
        this.loadingComments.set(false);
      },
      error: () => {
        this.loadingComments.set(false);
      },
    });
  }

  submitComment(): void {
    const detail = this.postDetail();
    const token = this.shareToken();
    const text = this.commentText().trim();
    if (!detail || !text || this.isPostingComment() || !this.auth.isAuthenticated()) return;

    this.isPostingComment.set(true);
    this.commentError.set(null);

    this.postService.addComment(detail.id, text, token).subscribe({
      next: (newComment) => {
        this.isPostingComment.set(false);
        this.commentText.set('');
        this.comments.update((prev) => [...prev, newComment]);
      },
      error: (err) => {
        this.isPostingComment.set(false);
        this.commentError.set(err.error?.message || 'Erreur lors de l’envoi du commentaire.');
      },
    });
  }

  deleteComment(commentId: string): void {
    const detail = this.postDetail();
    if (!detail || this.isDeletingCommentId()) return;

    this.isDeletingCommentId.set(commentId);
    this.postService.deleteComment(detail.id, commentId).subscribe({
      next: () => {
        this.isDeletingCommentId.set(null);
        this.comments.update((prev) => prev.filter((c) => c.id !== commentId));
      },
      error: (err) => {
        this.isDeletingCommentId.set(null);
      },
    });
  }

  canDeleteComment(comment: PostComment): boolean {
    const user = this.auth.currentUser();
    if (!user) return false;
    return user.id === comment.author.id || user.role === 'admin';
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 o';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  getInitials(name?: string | null): string {
    if (!name || !name.trim()) return 'CL';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}

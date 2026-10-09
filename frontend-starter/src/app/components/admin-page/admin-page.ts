import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../shared/services/admin.service';
import { AuthService } from '../../shared/services/auth.service';
import { PostAuthorManagement } from '../../shared/models/post.model';
import { User } from '../../shared/models/user.model';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.css',
})
export class AdminPageComponent {
  private readonly adminService = inject(AdminService);
  readonly authService = inject(AuthService);

  // État Modération des Posts
  readonly searchPostId = signal<string>('');
  readonly inspectedPost = signal<PostAuthorManagement | null>(null);
  readonly postLoading = signal<boolean>(false);
  readonly postError = signal<string | null>(null);
  readonly postSuccess = signal<string | null>(null);

  readonly archiveReason = signal<string>('Non-respect des règles communautaires');
  readonly showArchiveConfirm = signal<boolean>(false);
  readonly showRestoreConfirm = signal<boolean>(false);

  // État Modération des Utilisateurs
  readonly searchUserId = signal<string>('');
  readonly inspectedUser = signal<User | null>(null);
  readonly userLoading = signal<boolean>(false);
  readonly userError = signal<string | null>(null);
  readonly userSuccess = signal<string | null>(null);

  readonly showSuspendConfirm = signal<boolean>(false);
  readonly showReactivateConfirm = signal<boolean>(false);

  /**
   * Recherche et inspection détaillée d'un post.
   */
  inspectPost(): void {
    const id = this.searchPostId().trim();
    if (!id) {
      this.postError.set('Veuillez saisir un identifiant de post.');
      return;
    }

    this.postLoading.set(true);
    this.postError.set(null);
    this.postSuccess.set(null);
    this.inspectedPost.set(null);
    this.showArchiveConfirm.set(false);
    this.showRestoreConfirm.set(false);

    this.adminService.getPost(id).subscribe({
      next: (post) => {
        this.inspectedPost.set(post);
        this.postLoading.set(false);
      },
      error: (err: unknown) => {
        this.postLoading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.postError.set(err.error?.message || `Erreur ${err.status} lors de l'inspection du post.`);
        } else {
          this.postError.set('Erreur inattendue.');
        }
      },
    });
  }

  /**
   * Ouvre la confirmation d'archivage.
   */
  promptArchive(): void {
    this.postError.set(null);
    this.postSuccess.set(null);
    this.showArchiveConfirm.set(true);
  }

  cancelArchive(): void {
    this.showArchiveConfirm.set(false);
  }

  /**
   * Exécute l'archivage du post sélectionné.
   */
  executeArchive(): void {
    const post = this.inspectedPost();
    if (!post) return;

    this.postLoading.set(true);
    this.postError.set(null);
    const reason = this.archiveReason().trim() || 'Modération administrative';

    this.adminService.archivePost(post.id, reason).subscribe({
      next: (updated) => {
        this.inspectedPost.set(updated);
        this.postLoading.set(false);
        this.showArchiveConfirm.set(false);
        this.postSuccess.set(`Le post « ${updated.title} » a été archivé avec succès.`);
      },
      error: (err: unknown) => {
        this.postLoading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.postError.set(err.error?.message || `Erreur ${err.status} lors de l'archivage.`);
        } else {
          this.postError.set('Erreur lors de l\'archivage.');
        }
      },
    });
  }

  /**
   * Ouvre la confirmation de restauration.
   */
  promptRestore(): void {
    this.postError.set(null);
    this.postSuccess.set(null);
    this.showRestoreConfirm.set(true);
  }

  cancelRestore(): void {
    this.showRestoreConfirm.set(false);
  }

  /**
   * Exécute la restauration du post sélectionné.
   */
  executeRestore(): void {
    const post = this.inspectedPost();
    if (!post) return;

    this.postLoading.set(true);
    this.postError.set(null);

    this.adminService.restorePost(post.id).subscribe({
      next: (updated) => {
        this.inspectedPost.set(updated);
        this.postLoading.set(false);
        this.showRestoreConfirm.set(false);
        this.postSuccess.set(`Le post « ${updated.title} » a été restauré avec succès.`);
      },
      error: (err: unknown) => {
        this.postLoading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.postError.set(err.error?.message || `Erreur ${err.status} lors de la restauration.`);
        } else {
          this.postError.set('Erreur lors de la restauration.');
        }
      },
    });
  }

  /**
   * Recherche et inspection détaillée d'un utilisateur.
   */
  inspectUser(): void {
    const query = this.searchUserId().trim();
    if (!query) {
      this.userError.set('Veuillez saisir un identifiant ObjectId ou un email.');
      return;
    }

    this.userLoading.set(true);
    this.userError.set(null);
    this.userSuccess.set(null);
    this.inspectedUser.set(null);
    this.showSuspendConfirm.set(false);
    this.showReactivateConfirm.set(false);

    this.adminService.getUser(query).subscribe({
      next: (user) => {
        this.inspectedUser.set(user);
        this.userLoading.set(false);
      },
      error: (err: unknown) => {
        this.userLoading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.userError.set(err.error?.message || `Erreur ${err.status} lors de l'inspection.`);
        } else {
          this.userError.set('Erreur inattendue.');
        }
      },
    });
  }

  /**
   * Ouvre la confirmation de suspension.
   */
  promptSuspend(): void {
    const user = this.inspectedUser();
    if (!user) return;

    if (this.authService.currentUser()?.id === user.id) {
      this.userError.set('Un administrateur ne peut pas suspendre son propre compte.');
      return;
    }

    this.userError.set(null);
    this.userSuccess.set(null);
    this.showSuspendConfirm.set(true);
  }

  cancelSuspend(): void {
    this.showSuspendConfirm.set(false);
  }

  /**
   * Exécute la suspension de l'utilisateur.
   */
  executeSuspend(): void {
    const user = this.inspectedUser();
    if (!user) return;

    this.userLoading.set(true);
    this.userError.set(null);

    this.adminService.suspendUser(user.id).subscribe({
      next: (updated) => {
        this.inspectedUser.set(updated);
        this.userLoading.set(false);
        this.showSuspendConfirm.set(false);
        this.userSuccess.set(`Le compte de ${updated.name} a été suspendu.`);
      },
      error: (err: unknown) => {
        this.userLoading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.userError.set(err.error?.message || `Erreur ${err.status} lors de la suspension.`);
        } else {
          this.userError.set('Erreur lors de la suspension.');
        }
      },
    });
  }

  /**
   * Ouvre la confirmation de réactivation.
   */
  promptReactivate(): void {
    this.userError.set(null);
    this.userSuccess.set(null);
    this.showReactivateConfirm.set(true);
  }

  cancelReactivate(): void {
    this.showReactivateConfirm.set(false);
  }

  /**
   * Exécute la réactivation de l'utilisateur.
   */
  executeReactivate(): void {
    const user = this.inspectedUser();
    if (!user) return;

    this.userLoading.set(true);
    this.userError.set(null);

    this.adminService.reactivateUser(user.id).subscribe({
      next: (updated) => {
        this.inspectedUser.set(updated);
        this.userLoading.set(false);
        this.showReactivateConfirm.set(false);
        this.userSuccess.set(`Le compte de ${updated.name} a été réactivé.`);
      },
      error: (err: unknown) => {
        this.userLoading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.userError.set(err.error?.message || `Erreur ${err.status} lors de la réactivation.`);
        } else {
          this.userError.set('Erreur lors de la réactivation.');
        }
      },
    });
  }
}

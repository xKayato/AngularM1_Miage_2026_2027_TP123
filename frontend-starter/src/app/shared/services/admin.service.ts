import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';
import { PostAuthorManagement } from '../models/post.model';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/admin';

  /**
   * Archive un post par un administrateur pour motif de modération.
   */
  archivePost(postId: string, reason?: string): Observable<PostAuthorManagement> {
    return this.http.patch<PostAuthorManagement>(`${this.baseUrl}/posts/${postId}/archive`, {
      reason,
    });
  }

  /**
   * Restaure un post archivé par un administrateur.
   */
  restorePost(postId: string): Observable<PostAuthorManagement> {
    return this.http.patch<PostAuthorManagement>(`${this.baseUrl}/posts/${postId}/restore`, {});
  }

  /**
   * Suspend un compte utilisateur par un administrateur.
   */
  suspendUser(userId: string): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/users/${userId}/suspend`, {});
  }

  /**
   * Réactive un compte utilisateur suspendu par un administrateur.
   */
  reactivateUser(userId: string): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/users/${userId}/reactivate`, {});
  }

  /**
   * Consulte le profil d'un utilisateur (par identifiant ObjectId ou par email).
   */
  getUser(idOrEmail: string): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/users/${encodeURIComponent(idOrEmail)}`);
  }

  /**
   * Consulte un post pour instruction de modération (y compris post archivé).
   */
  getPost(postId: string): Observable<PostAuthorManagement> {
    return this.http.get<PostAuthorManagement>(`${this.baseUrl}/posts/${postId}`);
  }
}

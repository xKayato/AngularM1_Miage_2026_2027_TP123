import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page } from '../models/page.model';
import {
  AttachmentInfo,
  CreatePostDto,
  MyPostsFilterParams,
  PostAuthorManagement,
  PostComment,
  PostDetail,
  PostFilterParams,
  PostPreview,
  PostVisibility,
  ShareLinkCreatedResponse,
  ShareLinkInfo,
  UpdatePostDto,
} from '../models/post.model';
import { LikeResponse } from '../models/creator.model';

@Injectable({
  providedIn: 'root',
})
export class PostService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/posts';

  /**
   * Récupère la liste paginée des aperçus de posts (catalogue public et recherche).
   */
  getPosts(params?: PostFilterParams): Observable<Page<PostPreview>> {
    let httpParams = new HttpParams();

    if (params) {
      if (typeof params.page === 'number') {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (typeof params.limit === 'number') {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
      if (params.query?.trim()) {
        httpParams = httpParams.set('query', params.query.trim());
      }
      if (params.category?.trim()) {
        httpParams = httpParams.set('category', params.category.trim());
      }
      if (params.tags) {
        const tagsValue = Array.isArray(params.tags)
          ? params.tags.join(',')
          : params.tags;
        if (tagsValue.trim()) {
          httpParams = httpParams.set('tags', tagsValue.trim());
        }
      }
      if (params.mode) {
        httpParams = httpParams.set('mode', params.mode);
      }
      if (params.sort) {
        httpParams = httpParams.set('sort', params.sort);
      }
    }

    return this.http.get<Page<PostPreview>>(this.baseUrl, { params: httpParams });
  }

  /**
   * Récupère l'aperçu direct d'un post spécifique (par exemple pour afficher le placeholder verrouillé).
   */
  getPostPreview(id: string): Observable<PostPreview> {
    return this.http.get<PostPreview>(`${this.baseUrl}/${encodeURIComponent(id)}/preview`);
  }

  /**
   * Récupère le détail complet d'un post (lecture autorisée).
   */
  getPostDetail(id: string): Observable<PostDetail> {
    return this.http.get<PostDetail>(`${this.baseUrl}/${encodeURIComponent(id)}`);
  }

  /**
   * Récupère un post non répertorié via son jeton secret initial de partage.
   */
  getSharedPost(token: string): Observable<PostDetail> {
    return this.http.get<PostDetail>(`${this.baseUrl}/shared/${encodeURIComponent(token)}`);
  }

  /**
   * Récupère la liste paginée des posts appartenant à l'auteur connecté.
   */
  getMyPosts(params?: MyPostsFilterParams): Observable<Page<PostAuthorManagement>> {
    let httpParams = new HttpParams();

    if (params) {
      if (typeof params.page === 'number') {
        httpParams = httpParams.set('page', params.page.toString());
      }
      if (typeof params.limit === 'number') {
        httpParams = httpParams.set('limit', params.limit.toString());
      }
      if (params.status && params.status !== 'all') {
        httpParams = httpParams.set('status', params.status);
      }
    }

    return this.http.get<Page<PostAuthorManagement>>(`${this.baseUrl}/my`, {
      params: httpParams,
    });
  }

  /**
   * Crée un nouveau post en statut brouillon (draft).
   */
  createPost(dto: CreatePostDto): Observable<PostAuthorManagement> {
    return this.http.post<PostAuthorManagement>(this.baseUrl, dto);
  }

  /**
   * Met à jour les informations textuelles d'un post.
   */
  updatePost(id: string, dto: UpdatePostDto): Observable<PostAuthorManagement> {
    return this.http.put<PostAuthorManagement>(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
      dto,
    );
  }

  /**
   * Publie un post avec une visibilité explicite.
   */
  publishPost(
    id: string,
    visibility: PostVisibility,
  ): Observable<PostAuthorManagement> {
    return this.http.post<PostAuthorManagement>(
      `${this.baseUrl}/${encodeURIComponent(id)}/publish`,
      { visibility },
    );
  }

  /**
   * Repasse un post publié en statut brouillon (draft).
   */
  unpublishPost(id: string): Observable<PostAuthorManagement> {
    return this.http.post<PostAuthorManagement>(
      `${this.baseUrl}/${encodeURIComponent(id)}/unpublish`,
      {},
    );
  }

  /**
   * Téléverse un lot de pièces jointes (jusqu'à 10 fichiers) pour un post.
   * Utilise FormData et ne fixe pas manuellement le Content-Type pour laisser
   * le navigateur injecter le boundary multipart adéquat.
   */
  uploadAttachments(
    postId: string,
    files: File[],
  ): Observable<AttachmentInfo[]> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    return this.http.post<AttachmentInfo[]>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/attachments`,
      formData,
    );
  }

  /**
   * Télécharge le contenu binaire d'une pièce jointe sécurisée.
   * ⚠️ Sécurité : Si un shareToken est fourni, il est transmis EXCLUSIVEMENT via
   * l'en-tête HTTP 'X-Share-Token'. Il n'apparaît JAMAIS dans l'URL ni dans les query params.
   */
  getAttachmentBlob(
    postId: string,
    attachmentId: string,
    shareToken?: string,
  ): Observable<Blob> {
    let headers = new HttpHeaders();
    if (shareToken?.trim()) {
      headers = headers.set('X-Share-Token', shareToken.trim());
    }

    return this.http.get(
      `${this.baseUrl}/${encodeURIComponent(postId)}/attachments/${encodeURIComponent(attachmentId)}`,
      {
        headers,
        responseType: 'blob',
      },
    );
  }

  /**
   * Génère ou régénère un lien secret de partage valable 7 jours.
   */
  createShareLink(postId: string): Observable<ShareLinkCreatedResponse> {
    return this.http.post<ShareLinkCreatedResponse>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/share-link`,
      {},
    );
  }

  /**
   * Consulte l'état du lien de partage (sans exposer le secret).
   */
  getShareLinkInfo(postId: string): Observable<ShareLinkInfo> {
    return this.http.get<ShareLinkInfo>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/share-link`,
    );
  }

  /**
   * Révoque immédiatement le lien de partage d'un post.
   */
  revokeShareLink(postId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/share-link`,
    );
  }

  /**
   * Like un post auquel l'utilisateur a accès.
   */
  likePost(postId: string): Observable<LikeResponse> {
    return this.http.post<LikeResponse>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/like`,
      {},
    );
  }

  /**
   * Retire son like d'un post.
   */
  unlikePost(postId: string): Observable<LikeResponse> {
    return this.http.delete<LikeResponse>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/like`,
    );
  }

  /**
   * Définit ou retire la pièce jointe servant de couverture au projet (Mission 3).
   * Transmet { attachmentId } ou { attachmentId: null } pour le retrait.
   */
  setCover(
    postId: string,
    attachmentId: string | null,
  ): Observable<PostAuthorManagement> {
    return this.http.put<PostAuthorManagement>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/cover`,
      { attachmentId },
    );
  }

  /**
   * Récupère la liste des commentaires d'un post.
   * Transmet optionnellement le token de partage via X-Share-Token.
   */
  getComments(
    postId: string,
    shareToken?: string | null,
  ): Observable<PostComment[]> {
    let headers = new HttpHeaders();
    if (shareToken) {
      headers = headers.set('x-share-token', shareToken);
    }
    return this.http.get<PostComment[]>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/comments`,
      { headers },
    );
  }

  /**
   * Ajoute un commentaire sur un post.
   * Transmet optionnellement le token de partage via X-Share-Token si post link.
   */
  addComment(
    postId: string,
    text: string,
    shareToken?: string | null,
  ): Observable<PostComment> {
    let headers = new HttpHeaders();
    if (shareToken) {
      headers = headers.set('x-share-token', shareToken);
    }
    return this.http.post<PostComment>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/comments`,
      { text },
      { headers },
    );
  }

  /**
   * Supprime un commentaire (par son auteur ou par un administrateur).
   */
  deleteComment(
    postId: string,
    commentId: string,
  ): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>(
      `${this.baseUrl}/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    );
  }
}


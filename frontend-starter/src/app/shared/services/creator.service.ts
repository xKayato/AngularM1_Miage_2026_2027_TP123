import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreatorStatusResponse,
  FollowItem,
  FollowResponse,
  SubscribeResponse,
  SubscriptionItem,
} from '../models/creator.model';
import { Page } from '../models/page.model';

@Injectable({
  providedIn: 'root',
})
export class CreatorService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/creators';

  /**
   * Suit un créateur de manière unilatérale et gratuite.
   */
  follow(creatorId: string): Observable<FollowResponse> {
    return this.http.post<FollowResponse>(
      `${this.baseUrl}/${encodeURIComponent(creatorId)}/follow`,
      {},
    );
  }

  /**
   * Cesse de suivre un créateur.
   */
  unfollow(creatorId: string): Observable<FollowResponse> {
    return this.http.delete<FollowResponse>(
      `${this.baseUrl}/${encodeURIComponent(creatorId)}/follow`,
    );
  }

  /**
   * Active un abonnement simulé de 30 jours pour ce créateur.
   * Retourne 201 en cas de succès, ou propage une erreur 409 Conflict si un abonnement est déjà actif.
   */
  subscribe(creatorId: string): Observable<SubscribeResponse> {
    return this.http.post<SubscribeResponse>(
      `${this.baseUrl}/${encodeURIComponent(creatorId)}/subscribe`,
      {},
    );
  }

  /**
   * Récupère le statut d'interaction avec un créateur (isFollowing, isSubscribed, expiresAt).
   */
  getStatus(creatorId: string): Observable<CreatorStatusResponse> {
    return this.http.get<CreatorStatusResponse>(
      `${this.baseUrl}/${encodeURIComponent(creatorId)}/status`,
    );
  }

  /**
   * Récupère la liste paginée des créateurs suivis par l'utilisateur connecté.
   */
  getMyFollows(params?: { page?: number; limit?: number }): Observable<Page<FollowItem>> {
    let httpParams = new HttpParams();
    if (params?.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }
    return this.http.get<Page<FollowItem>>(`${this.baseUrl}/my/follows`, {
      params: httpParams,
    });
  }

  /**
   * Récupère la liste paginée des abonnements actifs de l'utilisateur connecté.
   */
  getMySubscriptions(params?: { page?: number; limit?: number }): Observable<Page<SubscriptionItem>> {
    let httpParams = new HttpParams();
    if (params?.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }
    return this.http.get<Page<SubscriptionItem>>(`${this.baseUrl}/my/subscriptions`, {
      params: httpParams,
    });
  }
}

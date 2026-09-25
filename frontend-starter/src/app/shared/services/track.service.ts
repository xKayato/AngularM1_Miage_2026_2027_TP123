import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches a paginated list of tracks for the authenticated user.
   * @param page Target page number (1-indexed).
   * @param limit Maximum number of tracks per page.
   * @param title Optional title filter string.
   */
  list(page = 1, limit = 5, title?: string): Observable<Page<Track>> {
    const params: Record<string, string | number> = { page, limit };
    if (title && title.trim()) {
      params['title'] = title.trim();
    }
    return this.http.get<Page<Track>>('/api/tracks', {
      params,
    });
  }

  upload(file: File, title: string, cover?: File): Observable<HttpEvent<Track>> {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    if (cover) {
      body.append('cover', cover);
    }
    return this.http.post<Track>('/api/tracks', body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  audio(id: string): Observable<Blob> {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  cover(id: string): Observable<Blob> {
    return this.http.get(`/api/tracks/${id}/cover`, {
      responseType: 'blob',
    });
  }

  updateCover(id: string, cover: File): Observable<Track> {
    const body = new FormData();
    body.append('cover', cover);
    return this.http.put<Track>(`/api/tracks/${id}/cover`, body);
  }

  deleteCover(id: string): Observable<void> {
    return this.http.delete<void>(`/api/tracks/${id}/cover`);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { CreatorService } from './creator.service';
import { FollowItem } from '../models/creator.model';
import { Page } from '../models/page.model';

describe('CreatorService — followers / following publics', () => {
  let service: CreatorService;
  let httpTesting: HttpTestingController;

  const item: FollowItem = {
    id: 'f-1',
    creator: { id: 'u-1', name: 'Alice', bio: '', hasAvatar: false, avatarUrl: null },
    createdAt: '2026-10-01T10:00:00.000Z',
  };

  const page: Page<FollowItem> = {
    items: [item],
    docs: [item],
    page: 1,
    limit: 20,
    total: 1,
    totalDocs: 1,
    pages: 1,
    totalPages: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CreatorService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CreatorService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  for (const kind of ['followers', 'following'] as const) {
    const call = (s: CreatorService, id: string, params?: { page?: number; limit?: number }) =>
      kind === 'followers' ? s.getCreatorFollowers(id, params) : s.getCreatorFollowing(id, params);

    it(`${kind} — GET /api/creators/:id/${kind} sans paramètres`, () => {
      let result: Page<FollowItem> | undefined;
      call(service, 'creator-1').subscribe((res) => (result = res));

      const req = httpTesting.expectOne(`/api/creators/creator-1/${kind}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush(page);

      expect(result?.docs?.[0].creator.name).toBe('Alice');
    });

    it(`${kind} — transmet page et limit`, () => {
      call(service, 'creator-1', { page: 3, limit: 12 }).subscribe();

      const req = httpTesting.expectOne((r) => r.url === `/api/creators/creator-1/${kind}`);
      expect(req.request.params.get('page')).toBe('3');
      expect(req.request.params.get('limit')).toBe('12');
      req.flush(page);
    });

    it(`${kind} — omet page=0 et limit=0`, () => {
      call(service, 'creator-1', { page: 0, limit: 0 }).subscribe();

      const req = httpTesting.expectOne((r) => r.url === `/api/creators/creator-1/${kind}`);
      expect(req.request.params.has('page')).toBe(false);
      expect(req.request.params.has('limit')).toBe(false);
      req.flush(page);
    });

    it(`${kind} — encode l'identifiant dans l'URL`, () => {
      call(service, 'a/b?c').subscribe();

      const req = httpTesting.expectOne(`/api/creators/a%2Fb%3Fc/${kind}`);
      req.flush(page);
    });

    it(`${kind} — propage une erreur 404`, () => {
      let status = 0;
      call(service, 'ghost').subscribe({
        error: (err: { status: number }) => (status = err.status),
      });

      httpTesting
        .expectOne(`/api/creators/ghost/${kind}`)
        .flush({ message: 'Créateur introuvable ou inactif' }, { status: 404, statusText: 'Not Found' });

      expect(status).toBe(404);
    });
  }
});

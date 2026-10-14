import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { CreatorService } from './creator.service';
import {
  CreatorStatusResponse,
  FollowResponse,
  SubscribeResponse,
} from '../models/creator.model';

describe('CreatorService', () => {
  let service: CreatorService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CreatorService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(CreatorService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('follow — appelle POST /api/creators/:id/follow', () => {
    const mockRes: FollowResponse = { following: true };

    service.follow('creator-1').subscribe((res) => {
      expect(res.following).toBe(true);
    });

    const req = httpTesting.expectOne('/api/creators/creator-1/follow');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(mockRes);
  });

  it('follow — propage une erreur 400 en cas d auto-follow', () => {
    let capturedError: any = null;

    service.follow('my-own-id').subscribe({
      next: () => expect.unreachable('Should have failed'),
      error: (err) => {
        capturedError = err;
      },
    });

    const req = httpTesting.expectOne('/api/creators/my-own-id/follow');
    req.flush(
      { message: 'Un utilisateur ne peut pas se suivre lui-même' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(capturedError.status).toBe(400);
    expect(capturedError.error.message).toContain(
      'ne peut pas se suivre lui-même',
    );
  });

  it('unfollow — appelle DELETE /api/creators/:id/follow', () => {
    const mockRes: FollowResponse = { following: false };

    service.unfollow('creator-1').subscribe((res) => {
      expect(res.following).toBe(false);
    });

    const req = httpTesting.expectOne('/api/creators/creator-1/follow');
    expect(req.request.method).toBe('DELETE');
    req.flush(mockRes);
  });

  it('subscribe — appelle POST /api/creators/:id/subscribe et valide 201', () => {
    const mockRes: SubscribeResponse = {
      subscribed: true,
      expiresAt: '2026-04-01T12:00:00.000Z',
    };

    service.subscribe('creator-1').subscribe((res) => {
      expect(res.subscribed).toBe(true);
      expect(res.expiresAt).toBe('2026-04-01T12:00:00.000Z');
    });

    const req = httpTesting.expectOne('/api/creators/creator-1/subscribe');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(mockRes, { status: 201, statusText: 'Created' });
  });

  it('subscribe — propage 409 Conflict si un abonnement est déjà actif', () => {
    let capturedError: any = null;

    service.subscribe('creator-1').subscribe({
      next: () => expect.unreachable('Should have failed'),
      error: (err) => {
        capturedError = err;
      },
    });

    const req = httpTesting.expectOne('/api/creators/creator-1/subscribe');
    req.flush(
      { message: 'Abonnement déjà actif jusqu au 01/04/2026' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(capturedError.status).toBe(409);
    expect(capturedError.error.message).toContain('Abonnement déjà actif');
  });

  it('getStatus — appelle GET /api/creators/:id/status et propage 401 si non connecté', () => {
    const mockStatus: CreatorStatusResponse = {
      isFollowing: true,
      isSubscribed: false,
      expiresAt: null,
    };

    service.getStatus('creator-1').subscribe((res) => {
      expect(res.isFollowing).toBe(true);
      expect(res.isSubscribed).toBe(false);
    });

    const req = httpTesting.expectOne('/api/creators/creator-1/status');
    expect(req.request.method).toBe('GET');
    req.flush(mockStatus);
  });

  it('getMyFollows — appelle GET /api/creators/my/follows avec pagination', () => {
    service.getMyFollows({ page: 2, limit: 5 }).subscribe((res) => {
      expect(res.totalDocs).toBe(12);
      expect(res.docs?.length).toBe(1);
      expect(res.docs?.[0].creator.name).toBe('Alice');
    });

    const req = httpTesting.expectOne((r) => r.url === '/api/creators/my/follows');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('5');

    req.flush({
      docs: [{ id: 'f-1', creator: { id: 'c-1', name: 'Alice' }, createdAt: '2026-10-14' }],
      items: [{ id: 'f-1', creator: { id: 'c-1', name: 'Alice' }, createdAt: '2026-10-14' }],
      totalDocs: 12,
      total: 12,
      page: 2,
      limit: 5,
      totalPages: 3,
      pages: 3,
      hasPrevPage: true,
      hasNextPage: true,
    });
  });

  it('getMySubscriptions — appelle GET /api/creators/my/subscriptions avec pagination', () => {
    service.getMySubscriptions({ page: 1, limit: 10 }).subscribe((res) => {
      expect(res.totalDocs).toBe(1);
      expect(res.docs?.[0].active).toBe(true);
      expect(res.docs?.[0].creator.name).toBe('Bob');
    });

    const req = httpTesting.expectOne((r) => r.url === '/api/creators/my/subscriptions');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('10');

    req.flush({
      docs: [
        {
          id: 's-1',
          creator: { id: 'c-2', name: 'Bob' },
          active: true,
          expiresAt: '2026-11-14T00:00:00.000Z',
          createdAt: '2026-10-14',
        },
      ],
      items: [],
      totalDocs: 1,
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      pages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    });
  });

  it('getCreators — appelle GET /api/creators avec pagination et query', () => {
    service.getCreators({ page: 1, limit: 10, query: 'Alice' }).subscribe((res) => {
      expect(res.totalDocs).toBe(1);
      expect(res.docs?.[0].name).toBe('Alice Luthier');
    });

    const req = httpTesting.expectOne((r) => r.url === '/api/creators');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.get('query')).toBe('Alice');

    const mockItem = {
      id: 'c-alice',
      name: 'Alice Luthier',
      bio: 'Bio Alice',
      profileTags: ['lutherie'],
      avatarUrl: '/api/users/c-alice/avatar',
      createdAt: '2026-10-14T00:00:00.000Z',
      followersCount: 5,
      creationsCount: 3,
    };

    req.flush({
      items: [mockItem],
      docs: [mockItem],
      total: 1,
      totalDocs: 1,
      page: 1,
      limit: 10,
      pages: 1,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    });
  });

  it('getCreatorProfile — appelle GET /api/creators/:id', () => {
    service.getCreatorProfile('c-alice').subscribe((res) => {
      expect(res.name).toBe('Alice Luthier');
      expect(res.subscribersCount).toBe(2);
      expect(res.creations.length).toBe(1);
    });

    const req = httpTesting.expectOne('/api/creators/c-alice');
    expect(req.request.method).toBe('GET');

    req.flush({
      id: 'c-alice',
      name: 'Alice Luthier',
      bio: 'Bio Alice',
      profileTags: ['lutherie'],
      avatarUrl: '/api/users/c-alice/avatar',
      createdAt: '2026-10-14T00:00:00.000Z',
      followersCount: 5,
      subscribersCount: 2,
      creationsCount: 1,
      isSelf: false,
      userInteractions: {
        isFollowing: false,
        isSubscribed: false,
        subscriptionExpiresAt: null,
      },
      creations: [
        {
          id: 'p-1',
          title: 'Guitare',
          category: 'Musique',
          tags: ['lutherie'],
          visibility: 'public',
          likesCount: 10,
          attachmentsCount: 1,
          hasAudio: false,
          coverUrl: null,
          publishedAt: '2026-10-14T00:00:00.000Z',
          isLocked: false,
          author: { id: 'c-alice', name: 'Alice Luthier' },
          shortDescription: 'Guitare fait main',
        },
      ],
    });
  });
});


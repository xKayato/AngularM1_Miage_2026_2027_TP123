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
});

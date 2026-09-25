import { TestBed } from '@angular/core/testing';
import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { TrackService } from './track.service';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

describe('TrackService', () => {
  let service: TrackService;
  let httpTesting: HttpTestingController;

  const mockTrack: Track = {
    id: 'track-1',
    title: 'Blues Backing Track in A',
    originalName: 'blues_a.mp3',
    mimeType: 'audio/mpeg',
    size: 3600000,
    createdAt: '2026-09-01T10:00:00.000Z',
  };

  const mockPage: Page<Track> = {
    items: [mockTrack],
    page: 1,
    limit: 5,
    total: 1,
    pages: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TrackService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(TrackService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should fetch tracks with default page=1 and limit=5 parameters', () => {
    service.list().subscribe((response) => {
      expect(response).toEqual(mockPage);
      expect(response.items.length).toBe(1);
      expect(response.items[0].title).toBe('Blues Backing Track in A');
      expect(response.pages).toBe(1);
    });

    const req = httpTesting.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('5');

    req.flush(mockPage);
  });

  it('should pass custom page and limit parameters to GET /api/tracks', () => {
    service.list(3, 10).subscribe((response) => {
      expect(response.page).toBe(3);
      expect(response.limit).toBe(10);
    });

    const req = httpTesting.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('limit')).toBe('10');

    req.flush({ ...mockPage, page: 3, limit: 10 });
  });

  it('should pass title filter parameter to GET /api/tracks when provided', () => {
    service.list(1, 5, 'blues').subscribe((response) => {
      expect(response.items[0].title).toBe('Blues Backing Track in A');
    });

    const req = httpTesting.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('5');
    expect(req.request.params.get('title')).toBe('blues');

    req.flush(mockPage);
  });

  it('should omit title parameter when not provided or only whitespace', () => {
    service.list(1, 5, '   ').subscribe();

    const req = httpTesting.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('5');
    expect(req.request.params.has('title')).toBe(false);

    req.flush(mockPage);
  });

  it('should propagate HTTP error when list() fails', () => {
    let errorStatus = 0;

    service.list(1, 5).subscribe({
      error: (err) => {
        errorStatus = err.status;
      },
    });

    const req = httpTesting.expectOne((r) => r.url === '/api/tracks');
    req.flush({ message: 'Erreur serveur' }, { status: 500, statusText: 'Server Error' });

    expect(errorStatus).toBe(500);
  });

  it('should post multipart FormData with audio, title, and reportProgress enabled', () => {
    const mockFile = new File(['dummy audio'], 'funk.mp3', { type: 'audio/mpeg' });
    const title = 'Funk Groove';

    let responseBody: Track | null = null;
    service.upload(mockFile, title).subscribe((event) => {
      if (event instanceof HttpResponse) {
        responseBody = event.body;
      }
    });

    const req = httpTesting.expectOne('/api/tracks');
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    expect(req.request.body instanceof FormData).toBe(true);

    const formData = req.request.body as FormData;
    expect(formData.get('title')).toBe(title);
    expect(formData.get('audio')).toBeDefined();

    // Vérifie que Content-Type n'est pas fixé manuellement pour laisser le navigateur injecter le boundary
    expect(req.request.headers.has('Content-Type')).toBe(false);

    req.flush(mockTrack);
    expect(responseBody).toEqual(mockTrack);
  });
});

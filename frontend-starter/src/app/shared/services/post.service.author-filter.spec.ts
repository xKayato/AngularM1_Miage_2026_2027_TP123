import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { PostService } from './post.service';

describe('PostService — filtres author / authorName', () => {
  let service: PostService;
  let httpTesting: HttpTestingController;

  const emptyPage = { items: [], docs: [], page: 1, limit: 9, total: 0, pages: 1 };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PostService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PostService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function expectCatalog() {
    return httpTesting.expectOne((r) => r.url === '/api/posts' && r.method === 'GET');
  }

  it('envoie author quand il est fourni', () => {
    service.getPosts({ page: 1, author: '64b000000000000000000001' }).subscribe();
    const req = expectCatalog();
    expect(req.request.params.get('author')).toBe('64b000000000000000000001');
    expect(req.request.params.has('authorName')).toBe(false);
    req.flush(emptyPage);
  });

  it('envoie authorName et le trim', () => {
    service.getPosts({ authorName: '  Alice Lego  ' }).subscribe();
    const req = expectCatalog();
    expect(req.request.params.get('authorName')).toBe('Alice Lego');
    req.flush(emptyPage);
  });

  it('omet author et authorName vides ou blancs', () => {
    service.getPosts({ author: '   ', authorName: '' }).subscribe();
    const req = expectCatalog();
    expect(req.request.params.has('author')).toBe(false);
    expect(req.request.params.has('authorName')).toBe(false);
    req.flush(emptyPage);
  });

  it('combine author avec category, query, tags et sort', () => {
    service
      .getPosts({
        page: 2,
        limit: 12,
        author: 'abc',
        category: 'Lego',
        query: 'château',
        tags: ['star-wars', 'moc'],
        sort: 'likes-desc',
      })
      .subscribe();
    const req = expectCatalog();
    const p = req.request.params;
    expect(p.get('author')).toBe('abc');
    expect(p.get('category')).toBe('Lego');
    expect(p.get('query')).toBe('château');
    expect(p.get('tags')).toBe('star-wars,moc');
    expect(p.get('page')).toBe('2');
    expect(p.get('limit')).toBe('12');
    req.flush(emptyPage);
  });

  it('n envoie jamais de jeton de partage dans les paramètres', () => {
    service.getPosts({ author: 'abc', authorName: 'Alice' }).subscribe();
    const req = expectCatalog();
    expect(req.request.urlWithParams).not.toMatch(/token/i);
    req.flush(emptyPage);
  });
});

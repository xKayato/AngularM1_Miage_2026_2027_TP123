import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { PostService } from './post.service';
import { Page } from '../models/page.model';
import {
  CreatePostDto,
  PostAuthorManagement,
  PostDetail,
  PostPreview,
  UpdatePostDto,
} from '../models/post.model';

describe('PostService', () => {
  let service: PostService;
  let httpTesting: HttpTestingController;

  const mockPreview: PostPreview = {
    id: 'post-1',
    author: { id: 'user-1', name: 'Alice Maker' },
    title: 'Robot Lego Autonome',
    shortDescription: 'Tutoriel complet pour construire un robot Lego suiveur.',
    category: 'Lego',
    tags: ['lego', 'diy'],
    visibility: 'public',
    likesCount: 12,
    attachmentsCount: 2,
    hasAudio: false,
    coverUrl: '/api/posts/post-1/attachments/att-1',
    publishedAt: '2026-03-01T10:00:00.000Z',
    isLocked: false,
  };

  const mockDetail: PostDetail = {
    id: 'post-1',
    author: { id: 'user-1', name: 'Alice Maker' },
    title: 'Robot Lego Autonome',
    shortDescription: 'Tutoriel complet pour construire un robot Lego suiveur.',
    content: '## Étape 1 : Assembler le châssis...',
    category: 'Lego',
    tags: ['lego', 'diy'],
    visibility: 'public',
    status: 'published',
    likesCount: 12,
    attachments: [
      {
        id: 'att-1',
        originalName: 'cover.jpg',
        mimeType: 'image/jpeg',
        size: 204800,
        family: 'image',
        downloadUrl: '/api/posts/post-1/attachments/att-1',
        isCover: true,
      },
    ],
    userInteractions: {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    },
    publishedAt: '2026-03-01T10:00:00.000Z',
    createdAt: '2026-02-28T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PostService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(PostService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  describe('Catalogue et consultation', () => {
    it('getPosts — envoie les bons paramètres et ne transmet JAMAIS X-Share-Token', () => {
      const mockPage: Page<PostPreview> = {
        items: [mockPreview],
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      };

      service
        .getPosts({
          page: 1,
          limit: 10,
          query: 'robot',
          category: 'Lego',
          tags: ['lego', 'diy'],
        })
        .subscribe((page) => {
          expect(page.items.length).toBe(1);
          expect(page.items[0].title).toBe('Robot Lego Autonome');
        });

      const req = httpTesting.expectOne((r) => r.url === '/api/posts');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.get('query')).toBe('robot');
      expect(req.request.params.get('category')).toBe('Lego');
      expect(req.request.params.get('tags')).toBe('lego,diy');
      expect(req.request.headers.has('X-Share-Token')).toBe(false);

      req.flush(mockPage);
    });

    it('getPostPreview — appelle /api/posts/:id/preview sans X-Share-Token', () => {
      service.getPostPreview('post-1').subscribe((preview) => {
        expect(preview.id).toBe('post-1');
      });

      const req = httpTesting.expectOne('/api/posts/post-1/preview');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('X-Share-Token')).toBe(false);
      req.flush(mockPreview);
    });

    it('getPostDetail — propage les erreurs 401 et 403', () => {
      let capturedError: any = null;

      service.getPostDetail('post-locked').subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          capturedError = err;
        },
      });

      const req = httpTesting.expectOne('/api/posts/post-locked');
      expect(req.request.method).toBe('GET');
      req.flush(
        { message: 'Ce contenu est réservé aux followers' },
        { status: 403, statusText: 'Forbidden' },
      );

      expect(capturedError).not.toBeNull();
      expect(capturedError.status).toBe(403);
      expect(capturedError.error.message).toBe(
        'Ce contenu est réservé aux followers',
      );
    });

    it('getPostDetail — propage une erreur 410 Gone si le post est archivé', () => {
      let capturedError: any = null;

      service.getPostDetail('post-archived').subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          capturedError = err;
        },
      });

      const req = httpTesting.expectOne('/api/posts/post-archived');
      req.flush(
        { message: 'Ce post a été archivé et n est plus accessible' },
        { status: 410, statusText: 'Gone' },
      );

      expect(capturedError.status).toBe(410);
    });

    it('getSharedPost — transmet le token dans l URL et gère le retour 410 si expiré', () => {
      let capturedError: any = null;
      const secret = 'a1b2c3d4e5f6';

      service.getSharedPost(secret).subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          capturedError = err;
        },
      });

      const req = httpTesting.expectOne(`/api/posts/shared/${secret}`);
      expect(req.request.method).toBe('GET');
      req.flush(
        { message: 'Ce lien de partage a expiré' },
        { status: 410, statusText: 'Gone' },
      );

      expect(capturedError.status).toBe(410);
    });
  });

  describe('Gestion des pièces jointes et X-Share-Token', () => {
    it('getAttachmentBlob — inclut X-Share-Token UNIQUEMENT si le token est fourni', () => {
      const secret = 'my-secret-token-32-bytes';
      const fakeBlob = new Blob(['fake content'], { type: 'image/jpeg' });

      service
        .getAttachmentBlob('post-1', 'att-1', secret)
        .subscribe((blob) => {
          expect(blob).toBeTruthy();
        });

      const req = httpTesting.expectOne('/api/posts/post-1/attachments/att-1');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      // Le secret figure dans le header et JAMAIS dans l'URL
      expect(req.request.url).not.toContain(secret);
      expect(req.request.headers.get('X-Share-Token')).toBe(secret);

      req.flush(fakeBlob);
    });

    it('getAttachmentBlob — omet X-Share-Token si aucun token n est passé', () => {
      const fakeBlob = new Blob(['audio binary'], { type: 'audio/mpeg' });

      service.getAttachmentBlob('post-1', 'att-audio').subscribe((blob) => {
        expect(blob).toBeTruthy();
      });

      const req = httpTesting.expectOne('/api/posts/post-1/attachments/att-audio');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('X-Share-Token')).toBe(false);

      req.flush(fakeBlob);
    });
  });

  describe('Cycle de vie et Espace Auteur', () => {
    it('createPost — effectue un POST /api/posts avec le corps attendu', () => {
      const dto: CreatePostDto = {
        title: 'Origami Grue',
        shortDescription: 'Pliage traditionnel en papier.',
        content: 'Instructions de pliage...',
        category: 'Origami',
        tags: ['origami', 'papercraft'],
      };

      const mockCreated: PostAuthorManagement = {
        ...mockDetail,
        title: dto.title,
        status: 'draft',
      };

      service.createPost(dto).subscribe((res) => {
        expect(res.title).toBe('Origami Grue');
        expect(res.status).toBe('draft');
      });

      const req = httpTesting.expectOne('/api/posts');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);

      req.flush(mockCreated);
    });

    it('updatePost — effectue un PUT /api/posts/:id avec les champs modifiés', () => {
      const updateDto: UpdatePostDto = {
        title: 'Robot Lego v2',
      };

      service.updatePost('post-1', updateDto).subscribe((res) => {
        expect(res.title).toBe('Robot Lego v2');
      });

      const req = httpTesting.expectOne('/api/posts/post-1');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updateDto);

      req.flush({ ...mockDetail, title: 'Robot Lego v2' });
    });

    it('publishPost — effectue un POST /api/posts/:id/publish avec la visibilité', () => {
      service.publishPost('post-1', 'subscribers').subscribe((res) => {
        expect(res.visibility).toBe('subscribers');
      });

      const req = httpTesting.expectOne('/api/posts/post-1/publish');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ visibility: 'subscribers' });

      req.flush({ ...mockDetail, visibility: 'subscribers', status: 'published' });
    });

    it('unpublishPost — effectue un POST /api/posts/:id/unpublish', () => {
      service.unpublishPost('post-1').subscribe((res) => {
        expect(res.status).toBe('draft');
      });

      const req = httpTesting.expectOne('/api/posts/post-1/unpublish');
      expect(req.request.method).toBe('POST');
      req.flush({ ...mockDetail, status: 'draft' });
    });

    it('getMyPosts — appelle GET /api/posts/my avec les filtres de statut', () => {
      service.getMyPosts({ page: 2, limit: 5, status: 'draft' }).subscribe((page) => {
        expect(page.items.length).toBe(0);
      });

      const req = httpTesting.expectOne((r) => r.url === '/api/posts/my');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('limit')).toBe('5');
      expect(req.request.params.get('status')).toBe('draft');

      req.flush({ items: [], page: 2, limit: 5, total: 0, pages: 1 });
    });

    it('uploadAttachments — envoie les fichiers en FormData via POST /api/posts/:id/attachments sans Content-Type forcé', () => {
      const dummyFile = new File(['fake-png-content'], 'test.png', { type: 'image/png' });

      service.uploadAttachments('post-1', [dummyFile]).subscribe((res) => {
        expect(res.length).toBe(1);
        expect(res[0].originalName).toBe('test.png');
        expect(res[0].family).toBe('image');
      });

      const req = httpTesting.expectOne('/api/posts/post-1/attachments');
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);
      expect(req.request.headers.has('Content-Type')).toBe(false);

      req.flush([
        {
          id: 'att-1',
          originalName: 'test.png',
          mimeType: 'image/png',
          size: 100,
          family: 'image',
          downloadUrl: '/api/posts/post-1/attachments/att-1',
        },
      ]);
    });
  });

  describe('Liens de partage secret', () => {
    it('createShareLink — appelle POST /api/posts/:id/share-link', () => {
      service.createShareLink('post-1').subscribe((res) => {
        expect(res.expiresInDays).toBe(7);
      });

      const req = httpTesting.expectOne('/api/posts/post-1/share-link');
      expect(req.request.method).toBe('POST');
      req.flush({
        shareUrl: 'http://localhost:4200/share/secret123',
        expiresAt: '2026-03-08T10:00:00.000Z',
        expiresInDays: 7,
      });
    });

    it('getShareLinkInfo — appelle GET /api/posts/:id/share-link', () => {
      service.getShareLinkInfo('post-1').subscribe((res) => {
        expect(res.hasLink).toBe(true);
        expect(res.status).toBe('active');
      });

      const req = httpTesting.expectOne('/api/posts/post-1/share-link');
      expect(req.request.method).toBe('GET');
      req.flush({
        hasLink: true,
        status: 'active',
        expiresAt: '2026-03-08T10:00:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
      });
    });

    it('revokeShareLink — appelle DELETE /api/posts/:id/share-link', () => {
      service.revokeShareLink('post-1').subscribe();

      const req = httpTesting.expectOne('/api/posts/post-1/share-link');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  describe('Likes', () => {
    it('likePost — appelle POST /api/posts/:id/like et gère l auto-like (400)', () => {
      let errorResponse: any = null;

      service.likePost('post-own').subscribe({
        next: () => expect.unreachable('Should have failed'),
        error: (err) => {
          errorResponse = err;
        },
      });

      const req = httpTesting.expectOne('/api/posts/post-own/like');
      expect(req.request.method).toBe('POST');
      req.flush(
        { message: 'Vous ne pouvez pas liker votre propre post' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(errorResponse.status).toBe(400);
    });

    it('unlikePost — appelle DELETE /api/posts/:id/like', () => {
      service.unlikePost('post-1').subscribe((res) => {
        expect(res.liked).toBe(false);
        expect(res.likesCount).toBe(11);
      });

      const req = httpTesting.expectOne('/api/posts/post-1/like');
      expect(req.request.method).toBe('DELETE');
      req.flush({ liked: false, likesCount: 11 });
    });
  });
});

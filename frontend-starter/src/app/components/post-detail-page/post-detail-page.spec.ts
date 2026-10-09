import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PostDetailPageComponent } from './post-detail-page';
import { PostService } from '../../shared/services/post.service';
import { AuthService } from '../../shared/services/auth.service';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { PostDetail, PostPreview } from '../../shared/models/post.model';

describe('PostDetailPageComponent', () => {
  let component: PostDetailPageComponent;
  let fixture: ComponentFixture<PostDetailPageComponent>;
  let postServiceMock: {
    getPostDetail: ReturnType<typeof vi.fn>;
    getPostPreview: ReturnType<typeof vi.fn>;
    getAttachmentBlob: ReturnType<typeof vi.fn>;
  };
  let authServiceMock: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
  };

  const mockDetail: PostDetail = {
    id: 'post-1',
    title: 'Ampli lampe DIY',
    shortDescription: 'Un ampli 5W fait maison.',
    content: 'Schéma électrique et montage complet...',
    category: 'Musique',
    tags: ['ampli', 'diy'],
    visibility: 'public',
    status: 'published',
    author: { id: 'author-1', name: 'HendrixMaker' },
    likesCount: 15,
    userInteractions: {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    },
    attachments: [
      {
        id: 'att-img',
        originalName: 'schema.png',
        mimeType: 'image/png',
        size: 1024,
        family: 'image',
        downloadUrl: '/api/posts/post-1/attachments/att-img',
        isCover: true,
      },
      {
        id: 'att-audio',
        originalName: 'test.mp3',
        mimeType: 'audio/mpeg',
        size: 2048,
        family: 'audio',
        downloadUrl: '/api/posts/post-1/attachments/att-audio',
        isCover: false,
      },
    ],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPreview: PostPreview = {
    id: 'post-1',
    title: 'Ampli lampe DIY',
    shortDescription: 'Un ampli 5W fait maison.',
    category: 'Musique',
    tags: ['ampli', 'diy'],
    visibility: 'subscribers',
    author: { id: 'author-1', name: 'HendrixMaker' },
    likesCount: 15,
    attachmentsCount: 2,
    hasAudio: true,
    coverUrl: null,
    isLocked: true,
    publishedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:http://localhost/mock-blob-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    postServiceMock = {
      getPostDetail: vi.fn().mockReturnValue(of(mockDetail)),
      getPostPreview: vi.fn().mockReturnValue(of(mockPreview)),
      getAttachmentBlob: vi.fn().mockReturnValue(of(new Blob(['dummy'], { type: 'text/plain' }))),
    };

    authServiceMock = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      currentUser: vi.fn().mockReturnValue({ id: 'u1', name: 'User 1' }),
    };

    await TestBed.configureTestingModule({
      imports: [PostDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: PostService, useValue: postServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: 'post-1' }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PostDetailPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('charge avec succès les détails du post et précharge les images', () => {
    fixture.detectChanges();

    expect(component.postDetail()).toEqual(mockDetail);
    expect(component.isLocked()).toBe(false);
    expect(component.loading()).toBe(false);
    // Doit avoir préchargé l'image
    expect(postServiceMock.getAttachmentBlob).toHaveBeenCalledWith('post-1', 'att-img');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('bascule sur PostPreview verrouillé en cas de 403 sur getPostDetail', () => {
    postServiceMock.getPostDetail.mockReturnValue(
      throwError(() => ({ status: 403, error: { message: 'Réservé aux abonnés' } }))
    );

    fixture.detectChanges();

    expect(component.isLocked()).toBe(true);
    expect(component.postPreview()).toEqual(mockPreview);
    expect(component.postDetail()).toBeNull();
    expect(component.loading()).toBe(false);
  });

  it('gère l’erreur 410 pour un post archivé', () => {
    postServiceMock.getPostDetail.mockReturnValue(
      throwError(() => ({ status: 410, error: { message: 'Gone' } }))
    );

    fixture.detectChanges();

    expect(component.error()).toContain('archivé');
    expect(component.loading()).toBe(false);
  });

  it('permet de lancer la lecture d’un audio et révoque l’URL précédente', () => {
    fixture.detectChanges();

    const audioAtt = mockDetail.attachments[1];
    component.playAudio(audioAtt);

    expect(postServiceMock.getAttachmentBlob).toHaveBeenCalledWith('post-1', 'att-audio');
    expect(component.currentAudioUrl()).toBe('blob:http://localhost/mock-blob-url');
    expect(component.activeAudioAttachmentId()).toBe('att-audio');

    // Jouer à nouveau révoque l'ancienne URL
    component.playAudio(audioAtt);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-blob-url');
  });

  it('déclenche le téléchargement d’un fichier via downloadFile', () => {
    fixture.detectChanges();

    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(val: string) {},
      set download(val: string) {},
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    component.downloadFile(mockDetail.attachments[0]);

    expect(postServiceMock.getAttachmentBlob).toHaveBeenCalledWith('post-1', 'att-img');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('révoque toutes les Blob URLs créées lors de ngOnDestroy', () => {
    fixture.detectChanges();
    component.ngOnDestroy();

    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

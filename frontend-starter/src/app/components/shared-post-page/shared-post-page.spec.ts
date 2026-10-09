import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { SharedPostPageComponent } from './shared-post-page';
import { PostService } from '../../shared/services/post.service';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { PostDetail } from '../../shared/models/post.model';

describe('SharedPostPageComponent', () => {
  let component: SharedPostPageComponent;
  let fixture: ComponentFixture<SharedPostPageComponent>;
  let postServiceMock: {
    getSharedPost: ReturnType<typeof vi.fn>;
    getAttachmentBlob: ReturnType<typeof vi.fn>;
  };

  const mockDetail: PostDetail = {
    id: 'post-99',
    title: 'Guitare partagée via secret',
    shortDescription: 'Description du projet privé.',
    content: 'Contenu secret accessible par lien...',
    category: 'Musique',
    tags: ['secret', 'lutherie'],
    visibility: 'link',
    status: 'published',
    author: { id: 'author-99', name: 'SecretMaker' },
    likesCount: 5,
    userInteractions: {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    },
    attachments: [
      {
        id: 'att-img-99',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 2048,
        family: 'image',
        downloadUrl: '/api/posts/post-99/attachments/att-img-99',
        isCover: true,
      },
      {
        id: 'att-audio-99',
        originalName: 'riff.wav',
        mimeType: 'audio/wav',
        size: 4096,
        family: 'audio',
        downloadUrl: '/api/posts/post-99/attachments/att-audio-99',
        isCover: false,
      },
    ],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const validToken = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  beforeEach(async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:http://localhost/mock-blob-shared');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    postServiceMock = {
      getSharedPost: vi.fn().mockReturnValue(of(mockDetail)),
      getAttachmentBlob: vi.fn().mockReturnValue(of(new Blob(['data'], { type: 'text/plain' }))),
    };

    await TestBed.configureTestingModule({
      imports: [SharedPostPageComponent],
      providers: [
        provideRouter([]),
        { provide: PostService, useValue: postServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ token: validToken }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedPostPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('charge le projet partagé avec le token et précharge les images avec X-Share-Token', () => {
    fixture.detectChanges();

    expect(postServiceMock.getSharedPost).toHaveBeenCalledWith(validToken);
    expect(component.postDetail()).toEqual(mockDetail);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();

    // Vérifie que le token est transmis pour charger l'image
    expect(postServiceMock.getAttachmentBlob).toHaveBeenCalledWith('post-99', 'att-img-99', validToken);
  });

  it('affiche un message d’erreur clair si le token est expiré ou révoqué (410)', () => {
    postServiceMock.getSharedPost.mockReturnValue(
      throwError(() => ({ status: 410, error: { message: 'Lien révoqué' } }))
    );

    fixture.detectChanges();

    expect(component.error()).toContain('invalide, révoqué ou a expiré');
    expect(component.loading()).toBe(false);
  });

  it('joue l’audio en transmettant le token de partage et révoque l’URL précédente', () => {
    fixture.detectChanges();

    const audioAtt = mockDetail.attachments[1];
    component.playAudio(audioAtt);

    expect(postServiceMock.getAttachmentBlob).toHaveBeenCalledWith('post-99', 'att-audio-99', validToken);
    expect(component.currentAudioUrl()).toBe('blob:http://localhost/mock-blob-shared');

    // Seconde lecture révoque la première
    component.playAudio(audioAtt);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-blob-shared');
  });

  it('télécharge le fichier en transmettant le token de partage', () => {
    fixture.detectChanges();

    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(val: string) {},
      set download(val: string) {},
      set rel(val: string) {},
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    component.downloadFile(mockDetail.attachments[0]);

    expect(postServiceMock.getAttachmentBlob).toHaveBeenCalledWith('post-99', 'att-img-99', validToken);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('révoque toutes les Blob URLs lors de la destruction du composant', () => {
    fixture.detectChanges();
    component.ngOnDestroy();

    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

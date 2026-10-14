import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PostDetailPageComponent } from './post-detail-page';
import { PostService } from '../../shared/services/post.service';
import { CreatorService } from '../../shared/services/creator.service';
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
    likePost: ReturnType<typeof vi.fn>;
    unlikePost: ReturnType<typeof vi.fn>;
    getComments: ReturnType<typeof vi.fn>;
    addComment: ReturnType<typeof vi.fn>;
    deleteComment: ReturnType<typeof vi.fn>;
  };
  let creatorServiceMock: {
    getStatus: ReturnType<typeof vi.fn>;
    follow: ReturnType<typeof vi.fn>;
    unfollow: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
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
      {
        id: 'att-pdf',
        originalName: 'notice.pdf',
        mimeType: 'application/pdf',
        size: 4096,
        family: 'pdf',
        downloadUrl: '/api/posts/post-1/attachments/att-pdf',
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
      likePost: vi.fn().mockReturnValue(of({ liked: true, likesCount: 16 })),
      unlikePost: vi.fn().mockReturnValue(of({ liked: false, likesCount: 15 })),
      getComments: vi.fn().mockReturnValue(of([])),
      addComment: vi.fn().mockReturnValue(
        of({
          id: 'c-1',
          postId: 'post-1',
          author: { id: 'u1', name: 'User 1' },
          text: 'Superbe notice !',
          createdAt: new Date().toISOString(),
        })
      ),
      deleteComment: vi.fn().mockReturnValue(of({ success: true })),
    };

    creatorServiceMock = {
      getStatus: vi.fn().mockReturnValue(of({ isFollowing: false, isSubscribed: false, expiresAt: null })),
      follow: vi.fn().mockReturnValue(of({ following: true })),
      unfollow: vi.fn().mockReturnValue(of({ following: false })),
      subscribe: vi.fn().mockReturnValue(of({ subscribed: true, expiresAt: '2026-11-08T12:00:00.000Z' })),
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
        { provide: CreatorService, useValue: creatorServiceMock },
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
    expect(creatorServiceMock.getStatus).toHaveBeenCalledWith('author-1');
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
    expect(creatorServiceMock.getStatus).toHaveBeenCalledWith('author-1');
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

  it('permet de suivre un créateur et met à jour le statut', () => {
    fixture.detectChanges();

    component.followAuthor();

    expect(creatorServiceMock.follow).toHaveBeenCalledWith('author-1');
    expect(component.creatorStatus()?.isFollowing).toBe(true);
    expect(component.actionMessage()).toContain('suivez');
  });

  it('permet de ne plus suivre un créateur et met à jour le statut', () => {
    creatorServiceMock.getStatus.mockReturnValue(
      of({ isFollowing: true, isSubscribed: false, expiresAt: null })
    );
    fixture.detectChanges();

    creatorServiceMock.getStatus.mockReturnValue(
      of({ isFollowing: false, isSubscribed: false, expiresAt: null })
    );

    component.unfollowAuthor();

    expect(creatorServiceMock.unfollow).toHaveBeenCalledWith('author-1');
    expect(component.creatorStatus()?.isFollowing).toBe(false);
    expect(component.actionMessage()).toContain('ne suivez plus');
  });

  it('active un abonnement simulé de 30 jours avec affichage de l’échéance', () => {
    fixture.detectChanges();

    component.subscribeAuthor();

    expect(creatorServiceMock.subscribe).toHaveBeenCalledWith('author-1');
    expect(component.creatorStatus()?.isSubscribed).toBe(true);
    expect(component.creatorStatus()?.expiresAt).toBe('2026-11-08T12:00:00.000Z');
    expect(component.actionMessage()).toContain('Simulation — aucun paiement');
  });

  it('gère l’erreur 409 (abonnement déjà actif) sans bloquer', () => {
    creatorServiceMock.subscribe.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: {
          message: 'Abonnement déjà actif jusqu’au 08/11/2026',
          expiresAt: '2026-11-08T12:00:00.000Z',
        },
      }))
    );
    fixture.detectChanges();

    component.subscribeAuthor();

    expect(component.actionError()).toContain('déjà actif');
    expect(component.creatorStatus()?.isSubscribed).toBe(true);
    expect(component.creatorStatus()?.expiresAt).toBe('2026-11-08T12:00:00.000Z');
    expect(component.isSubscribeLoading()).toBe(false);
  });

  it('interdit toute action de suivi ou abonnement si l’utilisateur est l’auteur lui-même', () => {
    authServiceMock.currentUser.mockReturnValue({ id: 'author-1', name: 'HendrixMaker' });
    fixture.detectChanges();

    expect(component.isSelfAuthor()).toBe(true);

    component.followAuthor();
    expect(creatorServiceMock.follow).not.toHaveBeenCalled();

    component.subscribeAuthor();
    expect(creatorServiceMock.subscribe).not.toHaveBeenCalled();
  });

  it('permet d’ajouter un like via toggleLike si non liké', () => {
    fixture.detectChanges();

    expect(component.postDetail()?.userInteractions.isLiked).toBe(false);
    expect(component.postDetail()?.likesCount).toBe(15);

    component.toggleLike();

    expect(postServiceMock.likePost).toHaveBeenCalledWith('post-1');
    expect(component.postDetail()?.userInteractions.isLiked).toBe(true);
    expect(component.postDetail()?.likesCount).toBe(16);
    expect(component.isLikeLoading()).toBe(false);
  });

  it('permet de retirer un like via toggleLike si déjà liké', () => {
    fixture.detectChanges();

    // Simuler un post déjà liké
    component.postDetail.update((p) =>
      p ? { ...p, likesCount: 16, userInteractions: { ...p.userInteractions, isLiked: true } } : null
    );

    component.toggleLike();

    expect(postServiceMock.unlikePost).toHaveBeenCalledWith('post-1');
    expect(component.postDetail()?.userInteractions.isLiked).toBe(false);
    expect(component.postDetail()?.likesCount).toBe(15);
    expect(component.isLikeLoading()).toBe(false);
  });

  it('empêche un auteur de liker son propre post', () => {
    authServiceMock.currentUser.mockReturnValue({ id: 'author-1', name: 'HendrixMaker' });
    fixture.detectChanges();

    expect(component.isSelfAuthor()).toBe(true);

    component.toggleLike();

    expect(postServiceMock.likePost).not.toHaveBeenCalled();
    expect(postServiceMock.unlikePost).not.toHaveBeenCalled();
  });

  it('gère une erreur serveur lors du like sans corrompre le post', () => {
    postServiceMock.likePost.mockReturnValue(
      throwError(() => ({ status: 403, error: { message: 'Contenu réservé' } }))
    );
    fixture.detectChanges();

    component.toggleLike();

    expect(component.actionError()).toContain('Contenu réservé');
    expect(component.postDetail()?.userInteractions.isLiked).toBe(false);
    expect(component.postDetail()?.likesCount).toBe(15);
    expect(component.isLikeLoading()).toBe(false);
  });

  it('génère un rendu Markdown sécurisé pour le contenu du projet', () => {
    component.postDetail.set({
      ...mockDetail,
      content: '### Instructions\n\nBien brancher les fils en **série** avec <script>hack()</script>',
    });

    const rendered = component.renderedContent();
    expect(rendered).toContain('<h4 class="tutorial-h4 font-display">Instructions</h4>');
    expect(rendered).toContain('<strong>série</strong>');
    expect(rendered).not.toContain('<script>');
    expect(rendered).toContain('&lt;script&gt;');
  });

  describe('Commentaires & Lecteur PDF (Mission 4)', () => {
    it('charge les commentaires à l initialisation du projet', () => {
      postServiceMock.getComments.mockReturnValue(
        of([
          {
            id: 'c-1',
            postId: 'post-1',
            author: { id: 'u2', name: 'Bob' },
            text: 'Très clair, merci !',
            createdAt: '2026-10-14T10:00:00.000Z',
          },
        ])
      );

      fixture.detectChanges();

      expect(postServiceMock.getComments).toHaveBeenCalledWith('post-1');
      expect(component.comments().length).toBe(1);
      expect(component.comments()[0].text).toBe('Très clair, merci !');
    });

    it('envoie un nouveau commentaire et met à jour la liste', () => {
      fixture.detectChanges();

      component.commentText.set('Superbe tutoriel');
      component.submitComment();

      expect(postServiceMock.addComment).toHaveBeenCalledWith('post-1', 'Superbe tutoriel');
      expect(component.comments().length).toBe(1);
      expect(component.comments()[0].text).toBe('Superbe notice !');
      expect(component.commentText()).toBe('');
      expect(component.isPostingComment()).toBe(false);
    });

    it('interdit l envoi de commentaire si le projet est archivé', () => {
      fixture.detectChanges();
      component.postDetail.set({
        ...mockDetail,
        status: 'archived',
      });

      component.commentText.set('Tentative');
      component.submitComment();

      expect(postServiceMock.addComment).not.toHaveBeenCalled();
      expect(component.commentError()).toContain('archivé');
    });

    it('supprime un commentaire avec succès', () => {
      fixture.detectChanges();
      component.comments.set([
        {
          id: 'c-1',
          postId: 'post-1',
          author: { id: 'u1', name: 'User 1' },
          text: 'Commentaire à supprimer',
          createdAt: new Date().toISOString(),
        },
      ]);

      component.deleteComment('c-1');

      expect(postServiceMock.deleteComment).toHaveBeenCalledWith('post-1', 'c-1');
      expect(component.comments().length).toBe(0);
      expect(component.isDeletingCommentId()).toBe(null);
    });

    it('canDeleteComment retourne true pour l auteur du commentaire ou un admin', () => {
      const comment1 = {
        id: 'c-1',
        postId: 'post-1',
        author: { id: 'u1', name: 'User 1' },
        text: 'Mon commentaire',
        createdAt: new Date().toISOString(),
      };
      const comment2 = {
        id: 'c-2',
        postId: 'post-1',
        author: { id: 'u-other', name: 'Other' },
        text: 'Autre commentaire',
        createdAt: new Date().toISOString(),
      };

      // Connecté en tant que u1
      authServiceMock.currentUser.mockReturnValue({ id: 'u1', role: 'user' });
      expect(component.canDeleteComment(comment1)).toBe(true);
      expect(component.canDeleteComment(comment2)).toBe(false);

      // Connecté en tant qu'admin
      authServiceMock.currentUser.mockReturnValue({ id: 'u-admin', role: 'admin' });
      expect(component.canDeleteComment(comment2)).toBe(true);
    });

    it('ouvre le lecteur PDF sécurisé avec Blob URL et le referme proprement', () => {
      const pdfAtt = mockDetail.attachments.find((a) => a.family === 'pdf')!;
      postServiceMock.getAttachmentBlob.mockReturnValue(
        of(new Blob(['fake-pdf'], { type: 'application/pdf' }))
      );

      fixture.detectChanges();

      component.viewPdf(pdfAtt);

      expect(component.activePdfAttachment()).toEqual(pdfAtt);
      expect(postServiceMock.getAttachmentBlob).toHaveBeenCalledWith('post-1', 'att-pdf');
      expect(component.safePdfBlobUrl()).toBeTruthy();
      expect(component.isPdfLoading()).toBe(false);

      // Fermeture du visualiseur
      component.closePdfViewer();
      expect(component.activePdfAttachment()).toBe(null);
      expect(component.safePdfBlobUrl()).toBe(null);
    });
  });
});


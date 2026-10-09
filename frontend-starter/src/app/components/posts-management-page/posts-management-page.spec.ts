import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { PostsManagementPageComponent } from './posts-management-page';
import { PostService } from '../../shared/services/post.service';
import { PostAuthorManagement } from '../../shared/models/post.model';
import { Page } from '../../shared/models/page.model';

describe('PostsManagementPageComponent', () => {
  let component: PostsManagementPageComponent;
  let fixture: ComponentFixture<PostsManagementPageComponent>;
  let postServiceMock: {
    getMyPosts: ReturnType<typeof vi.fn>;
    createPost: ReturnType<typeof vi.fn>;
    updatePost: ReturnType<typeof vi.fn>;
    publishPost: ReturnType<typeof vi.fn>;
    unpublishPost: ReturnType<typeof vi.fn>;
    uploadAttachments: ReturnType<typeof vi.fn>;
  };

  const mockPost: PostAuthorManagement = {
    id: 'post-1',
    author: { id: 'author-1', name: 'Auteur Test' },
    title: 'Support mural guitare',
    shortDescription: 'Un tutoriel pas à pas pour fabriquer un support.',
    content: '## Instructions complètes de montage...',
    category: 'Lego',
    tags: ['lego', 'guitare'],
    visibility: 'public',
    status: 'draft',
    likesCount: 0,
    attachments: [],
    userInteractions: {
      isLiked: false,
      isFollowingAuthor: false,
      isSubscribedToAuthor: false,
      subscriptionExpiresAt: null,
    },
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPage: Page<PostAuthorManagement> = {
    items: [mockPost],
    docs: [mockPost],
    total: 1,
    totalDocs: 1,
    limit: 10,
    page: 1,
    pages: 1,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
    pagingCounter: 1,
  };

  beforeEach(async () => {
    postServiceMock = {
      getMyPosts: vi.fn().mockReturnValue(of(mockPage)),
      createPost: vi.fn(),
      updatePost: vi.fn(),
      publishPost: vi.fn(),
      unpublishPost: vi.fn(),
      uploadAttachments: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PostsManagementPageComponent],
      providers: [{ provide: PostService, useValue: postServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(PostsManagementPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('crée le composant et charge initialement ses posts', () => {
    expect(component).toBeTruthy();
    expect(postServiceMock.getMyPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      status: 'all',
    });
    expect(component.posts().length).toBe(1);
    expect(component.posts()[0].title).toBe('Support mural guitare');
  });

  it('permet de filtrer les posts par statut', () => {
    component.setFilter('draft');
    expect(component.activeFilter()).toBe('draft');
    expect(postServiceMock.getMyPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      status: 'draft',
    });
  });

  describe('Validation et normalisation des tags', () => {
    it('normalise correctement les tags en minuscules et trim', () => {
      const res = component.parseAndNormalizeTags('  LEGO , DIY-projet  , Bois ');
      expect(res.valid).toBe(true);
      expect(res.tags).toEqual(['lego', 'diy-projet', 'bois']);
      expect(res.error).toBeNull();
    });

    it('refuse les tags invalides avec caractères spéciaux ou espaces internes', () => {
      const res = component.parseAndNormalizeTags('lego, tag invalide!');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Tag invalide');
    });

    it('refuse les doublons de tags après normalisation', () => {
      const res = component.parseAndNormalizeTags('lego, LEGO');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('doublon');
    });

    it('refuse une saisie sans tag ou avec plus de 10 tags', () => {
      const emptyRes = component.parseAndNormalizeTags('   ');
      expect(emptyRes.valid).toBe(false);

      const tooMany = component.parseAndNormalizeTags(
        't1,t2,t3,t4,t5,t6,t7,t8,t9,t10,t11',
      );
      expect(tooMany.valid).toBe(false);
    });
  });

  describe('Formulaire réactif de création de brouillon', () => {
    it('invalide le formulaire si le titre est trop court', () => {
      component.startCreate();
      component.postForm.patchValue({
        title: 'Ab',
        shortDescription: 'Description courte de test',
        content: 'Contenu complet suffisant',
        category: 'Lego',
        tagsInput: 'lego',
      });
      expect(component.postForm.invalid).toBe(true);
      expect(component.postForm.get('title')?.hasError('minlength')).toBe(true);
    });

    it('crée un nouveau brouillon via postService.createPost', () => {
      component.startCreate();
      component.postForm.patchValue({
        title: 'Nouveau projet robotique',
        shortDescription: 'Description courte de test suffisante',
        content: 'Contenu complet suffisant pour le tutoriel',
        category: 'Modèles 3D',
        tagsInput: '3d, robotique',
      });

      const newPost: PostAuthorManagement = {
        ...mockPost,
        id: 'post-new',
        title: 'Nouveau projet robotique',
      };
      postServiceMock.createPost.mockReturnValue(of(newPost));

      component.onSubmit();

      expect(postServiceMock.createPost).toHaveBeenCalledWith({
        title: 'Nouveau projet robotique',
        shortDescription: 'Description courte de test suffisante',
        content: 'Contenu complet suffisant pour le tutoriel',
        category: 'Modèles 3D',
        tags: ['3d', 'robotique'],
      });
      expect(component.currentView()).toBe('list');
      expect(component.successMessage()).toContain('créé avec succès');
    });
  });

  describe('Modification d’un post', () => {
    it('charge les données du post dans le formulaire et met à jour via postService.updatePost', () => {
      component.startEdit(mockPost);
      expect(component.currentView()).toBe('editor');
      expect(component.editingPostId()).toBe('post-1');
      expect(component.postForm.value.title).toBe('Support mural guitare');

      component.postForm.patchValue({
        title: 'Support mural guitare v2',
      });

      const updatedPost: PostAuthorManagement = {
        ...mockPost,
        title: 'Support mural guitare v2',
      };
      postServiceMock.updatePost.mockReturnValue(of(updatedPost));

      component.onSubmit();

      expect(postServiceMock.updatePost).toHaveBeenCalledWith(
        'post-1',
        expect.objectContaining({ title: 'Support mural guitare v2' }),
      );
      expect(component.currentView()).toBe('list');
      expect(component.editingPostId()).toBeNull();
    });

    it('interdit la modification d’un post archivé', () => {
      const archivedPost: PostAuthorManagement = {
        ...mockPost,
        status: 'archived',
      };
      component.startEdit(archivedPost);
      expect(component.error()).toContain('archivé');
      expect(component.currentView()).toBe('list');
    });
  });

  describe('Publication et dépublication', () => {
    it('ouvre la modale de publication et publie avec la visibilité choisie', () => {
      component.openPublishModal(mockPost);
      expect(component.publishingPost()).toEqual(mockPost);

      component.selectedVisibility.set('followers');

      const publishedPost: PostAuthorManagement = {
        ...mockPost,
        status: 'published',
        visibility: 'followers',
      };
      postServiceMock.publishPost.mockReturnValue(of(publishedPost));

      component.confirmPublish();

      expect(postServiceMock.publishPost).toHaveBeenCalledWith(
        'post-1',
        'followers',
      );
      expect(component.publishingPost()).toBeNull();
      expect(component.successMessage()).toContain('publié avec la visibilité followers');
    });

    it('repasse un post publié en brouillon via unpublishPost', () => {
      const publishedPost: PostAuthorManagement = {
        ...mockPost,
        status: 'published',
      };
      const unpubDraft: PostAuthorManagement = {
        ...mockPost,
        status: 'draft',
      };
      postServiceMock.unpublishPost.mockReturnValue(of(unpubDraft));

      component.unpublishPost(publishedPost);

      expect(postServiceMock.unpublishPost).toHaveBeenCalledWith('post-1');
      expect(component.successMessage()).toContain('repassé en brouillon');
    });

    it('interdit de publier ou dépublier un post archivé', () => {
      const archivedPost: PostAuthorManagement = {
        ...mockPost,
        status: 'archived',
      };

      component.openPublishModal(archivedPost);
      expect(component.error()).toContain('archivé');
      expect(component.publishingPost()).toBeNull();

      component.unpublishPost(archivedPost);
      expect(component.error()).toContain('archivé');
      expect(postServiceMock.unpublishPost).not.toHaveBeenCalled();
    });
  });

  describe('Pièces jointes et upload sécurisé (Mission 3)', () => {
    it('ouvre la modale des pièces jointes et initialise son état', () => {
      component.openAttachmentsModal(mockPost);
      expect(component.attachmentsModalPost()).toEqual(mockPost);
      expect(component.selectedFiles()).toEqual([]);
      expect(component.attachmentsError()).toBeNull();

      component.closeAttachmentsModal();
      expect(component.attachmentsModalPost()).toBeNull();
    });

    it('refuse l’ouverture de la modale pour un post archivé', () => {
      const archivedPost: PostAuthorManagement = {
        ...mockPost,
        status: 'archived',
      };
      component.openAttachmentsModal(archivedPost);
      expect(component.error()).toContain('archivé');
      expect(component.attachmentsModalPost()).toBeNull();
    });

    it('prévalide le nombre maximal de fichiers (quota de 10)', () => {
      const dummyFile = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
      // Post ayant déjà 9 pièces jointes
      const existingAttachments = Array.from({ length: 9 }, (_, i) => ({
        id: `att-${i}`,
        originalName: `f${i}.pdf`,
        mimeType: 'application/pdf',
        size: 1000,
        family: 'pdf' as const,
        downloadUrl: `/api/posts/post-1/attachments/att-${i}`,
        isCover: false,
      }));

      // 9 existants + 2 nouveaux = 11 > 10
      const res = component.validateSelectedFiles([dummyFile, dummyFile], existingAttachments);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('ne peut pas dépasser 10');
    });

    it('prévalide la taille cumulée maximale de 50 Mo', () => {
      const hugeFile = {
        name: 'audio.mp3',
        size: 26 * 1024 * 1024,
      } as unknown as File;
      const hugeFile2 = {
        name: 'audio2.mp3',
        size: 25 * 1024 * 1024,
      } as unknown as File;

      const res = component.validateSelectedFiles([hugeFile, hugeFile2], []);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('50 Mo');
    });

    it('refuse les formats ou extensions non autorisés', () => {
      const forbiddenFile = new File(['content'], 'virus.exe', { type: 'application/octet-stream' });
      const res = component.validateSelectedFiles([forbiddenFile], []);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('pas autorisé');
    });

    it('refuse une image dépassant 5 Mo', () => {
      const bigImage = {
        name: 'photo.png',
        size: 6 * 1024 * 1024,
      } as unknown as File;
      const res = component.validateSelectedFiles([bigImage], []);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('limite de 5 Mo');
    });

    it('refuse un PDF dépassant 10 Mo', () => {
      const bigPdf = {
        name: 'rapport.pdf',
        size: 11 * 1024 * 1024,
      } as unknown as File;
      const res = component.validateSelectedFiles([bigPdf], []);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('limite de 10 Mo');
    });

    it('refuse un fichier audio dépassant 25 Mo', () => {
      const bigAudio = {
        name: 'musique.wav',
        size: 26 * 1024 * 1024,
      } as unknown as File;
      const res = component.validateSelectedFiles([bigAudio], []);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('limite de 25 Mo');
    });

    it('valide un lot conforme respectant quotas et types', () => {
      const validImg = {
        name: 'illustration.png',
        size: 2 * 1024 * 1024,
      } as unknown as File;
      const validAudio = {
        name: 'preview.mp3',
        size: 10 * 1024 * 1024,
      } as unknown as File;

      const res = component.validateSelectedFiles([validImg, validAudio], []);
      expect(res.valid).toBe(true);
      expect(res.error).toBeNull();
    });

    it('envoie les pièces jointes, bloque le double clic et recharge les métadonnées', () => {
      component.openAttachmentsModal(mockPost);
      const fileToUpload = new File(['dummy-wav-content'], 'sample.wav', { type: 'audio/wav' });
      component.selectedFiles.set([fileToUpload]);

      const mockCreatedAttachments = [
        {
          id: 'att-new-1',
          originalName: 'sample.wav',
          mimeType: 'audio/wav',
          size: fileToUpload.size,
          family: 'audio' as const,
          downloadUrl: '/api/posts/post-1/attachments/att-new-1',
          isCover: false,
        },
      ];
      postServiceMock.uploadAttachments.mockReturnValue(of(mockCreatedAttachments));

      component.uploadSelectedFiles();

      expect(postServiceMock.uploadAttachments).toHaveBeenCalledWith('post-1', [fileToUpload]);
      expect(component.uploadingAttachments()).toBe(false);
      expect(component.attachmentsModalPost()).toBeNull();
      expect(component.successMessage()).toContain('pièce(s) jointe(s) ajoutée(s) avec succès');
      expect(postServiceMock.getMyPosts).toHaveBeenCalledTimes(2); // 1 au init + 1 après upload
    });

    it('gère les erreurs retournées par l’API lors de l’upload', () => {
      component.openAttachmentsModal(mockPost);
      const fileToUpload = new File(['content'], 'sample.pdf', { type: 'application/pdf' });
      component.selectedFiles.set([fileToUpload]);

      postServiceMock.uploadAttachments.mockReturnValue(
        throwError(() => ({
          error: { message: 'Dépassement de quota de 50 Mo' },
        }))
      );

      component.uploadSelectedFiles();

      expect(component.uploadingAttachments()).toBe(false);
      expect(component.attachmentsError()).toBe('Dépassement de quota de 50 Mo');
      expect(component.attachmentsModalPost()).not.toBeNull(); // la modale reste ouverte pour corriger
    });

    it('formate correctement les tailles en octets, Ko et Mo', () => {
      expect(component.formatBytes(0)).toBe('0 o');
      expect(component.formatBytes(512)).toBe('512 o');
      expect(component.formatBytes(2048)).toBe('2.0 Ko');
      expect(component.formatBytes(15 * 1024 * 1024)).toBe('15.0 Mo');
    });
  });
});


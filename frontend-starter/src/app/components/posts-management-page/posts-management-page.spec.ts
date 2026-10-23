import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { PostsManagementPageComponent } from './posts-management-page';
import { PostService } from '../../shared/services/post.service';
import { AttachmentInfo, PostAuthorManagement } from '../../shared/models/post.model';
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
    setCover: ReturnType<typeof vi.fn>;
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
    commentsCount: 0,
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
      setCover: vi.fn(),
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

    it('setCover — appelle postService.setCover pour définir une couverture et rafraîchit la liste', () => {
      component.openAttachmentsModal(mockPost);
      const updatedPost = { ...mockPost };
      postServiceMock.setCover.mockReturnValue(of(updatedPost));

      component.setCover('att-img-1');

      expect(postServiceMock.setCover).toHaveBeenCalledWith('post-1', 'att-img-1');
      expect(component.successMessage()).toContain('mise à jour avec succès');
      expect(postServiceMock.getMyPosts).toHaveBeenCalledTimes(2);
    });

    it('setCover — appelle postService.setCover avec null pour retirer la couverture', () => {
      component.openAttachmentsModal(mockPost);
      const updatedPost = { ...mockPost };
      postServiceMock.setCover.mockReturnValue(of(updatedPost));

      component.setCover(null);

      expect(postServiceMock.setCover).toHaveBeenCalledWith('post-1', null);
      expect(component.successMessage()).toContain('retirée avec succès');
    });

    it('previewHtml — génère un rendu Markdown sécurisé à partir du contenu saisi', () => {
      component.postForm.patchValue({
        content: '# Nouveau Titre\n\nVoici un texte en **gras** avec <script>alert(1)</script>',
      });

      const html = component.previewHtml();
      expect(html).toContain('<h2 class="tutorial-h2 font-display">Nouveau Titre</h2>');
      expect(html).toContain('<strong>gras</strong>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('permet la sélection et le retrait de fichiers dans le formulaire initial de création', () => {
      component.startCreate();
      expect(component.creationSelectedFiles().length).toBe(0);

      const fakeFile = new File(['content'], 'notice.pdf', { type: 'application/pdf' });
      const event = {
        target: { files: [fakeFile], value: '' },
      } as unknown as Event;

      component.onCreationFilesSelected(event);
      expect(component.creationSelectedFiles().length).toBe(1);
      expect(component.creationSelectedFiles()[0].name).toBe('notice.pdf');
      expect(component.getFileIcon('notice.pdf')).toBe('📄');

      component.removeCreationFile(0);
      expect(component.creationSelectedFiles().length).toBe(0);
    });

    it('enchaîne création de post et téléversement transparent des pièces jointes avec succès', () => {
      component.startCreate();
      component.postForm.setValue({
        title: 'Nouveau projet avec PJ',
        shortDescription: 'Description valide de plus de dix caractères',
        content: 'Contenu complet avec étapes de fabrication...',
        category: 'Lego',
        tagsInput: 'diy, tuto',
      });

      const fakeFile = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
      component.creationSelectedFiles.set([fakeFile]);

      const createdPost = { ...mockPost, id: 'created-123', title: 'Nouveau projet avec PJ' };
      postServiceMock.createPost.mockReturnValue(of(createdPost));
      postServiceMock.uploadAttachments.mockReturnValue(
        of([
          {
            id: 'att-created',
            originalName: 'photo.png',
            mimeType: 'image/png',
            size: fakeFile.size,
            family: 'image',
            downloadUrl: '/api/posts/created-123/attachments/att-created',
            isCover: false,
          },
        ])
      );

      component.onSubmit();

      expect(postServiceMock.createPost).toHaveBeenCalled();
      expect(postServiceMock.uploadAttachments).toHaveBeenCalledWith('created-123', [fakeFile]);
      expect(component.successMessage()).toContain('créé avec succès avec 1 pièce(s) jointe(s)');
      expect(component.currentView()).toBe('list');
      expect(component.creationSelectedFiles().length).toBe(0);
    });

    it('gère l échec de l upload après création du brouillon sans fausse réussite', () => {
      component.startCreate();
      component.postForm.setValue({
        title: 'Projet avec upload échoué',
        shortDescription: 'Description valide de plus de dix caractères',
        content: 'Contenu complet avec étapes...',
        category: 'Lego',
        tagsInput: 'diy, test',
      });

      const fakeFile = new File(['fail-bytes'], 'broken.pdf', { type: 'application/pdf' });
      component.creationSelectedFiles.set([fakeFile]);

      const createdPost = { ...mockPost, id: 'post-fail', title: 'Projet avec upload échoué' };
      postServiceMock.createPost.mockReturnValue(of(createdPost));
      postServiceMock.uploadAttachments.mockReturnValue(
        throwError(() => ({ error: { message: 'Stockage temporairement indisponible' } }))
      );

      component.onSubmit();

      expect(postServiceMock.createPost).toHaveBeenCalled();
      expect(postServiceMock.uploadAttachments).toHaveBeenCalled();
      // Ne doit pas afficher de message de plein succès
      expect(component.successMessage()).toBeNull();
      // Doit afficher un avertissement clair précisant que le brouillon existe mais que l'upload a échoué
      expect(component.error()).toContain('a bien été créé, mais l\'envoi des pièces jointes a échoué');
      expect(component.error()).toContain('Stockage temporairement indisponible');
      expect(component.currentView()).toBe('list');
    });

    it('réinitialise les fichiers sélectionnés lors de l annulation de l éditeur', () => {
      component.startCreate();
      const fakeFile = new File(['content'], 'schema.png', { type: 'image/png' });
      component.creationSelectedFiles.set([fakeFile]);

      component.cancelEditor();

      expect(component.currentView()).toBe('list');
      expect(component.creationSelectedFiles().length).toBe(0);
      expect(component.creationFilesError()).toBeNull();
    });
  });

  describe('Amélioration — Insertion précise des pièces jointes, Drag-and-Drop et Curseur', () => {
    beforeEach(() => {
      component.startCreate();
    });

    it('insère un snippet au début du texte (position 0)', () => {
      component.postForm.get('content')?.setValue('Deuxième partie du tutoriel.');
      component.insertSnippetAtCursor('## 1. Introduction', 0, 0);

      const content = component.postForm.get('content')?.value;
      expect(content.startsWith('## 1. Introduction\n\nDeuxième partie')).toBe(true);
      expect(component.lastSelectionStart).toBe('## 1. Introduction\n\n'.length);
    });

    it('insère un snippet au milieu du texte à la position exacte du curseur', () => {
      component.postForm.get('content')?.setValue('Début du texte. Fin du texte.');
      // Position 16 (juste après le point)
      component.insertSnippetAtCursor('![Schéma](attachment:att-123)', 16, 16);

      const content = component.postForm.get('content')?.value;
      expect(content).toContain('![Schéma](attachment:att-123)');
      expect(content.startsWith('Début du texte.')).toBe(true);
      expect(content.endsWith('Fin du texte.')).toBe(true);
    });

    it('insère un snippet à la fin du texte sans duplication de retours chariot', () => {
      component.postForm.get('content')?.setValue('Contenu complet déjà saisi.');
      const len = 'Contenu complet déjà saisi.'.length;
      component.insertSnippetAtCursor('## Étape finale', len, len);

      const content = component.postForm.get('content')?.value;
      expect(content.endsWith('\n\n## Étape finale')).toBe(true);
    });

    it('remplace le texte sélectionné par le snippet inséré', () => {
      component.postForm.get('content')?.setValue('Cliquez sur [PLACEHOLDER] pour continuer.');
      const start = 'Cliquez sur '.length;
      const end = start + '[PLACEHOLDER]'.length;

      component.insertSnippetAtCursor('[📄 Télécharger notice (PDF)](attachment:att-pdf-1)', start, end);

      const content = component.postForm.get('content')?.value;
      expect(content).not.toContain('[PLACEHOLDER]');
      expect(content).toContain('[📄 Télécharger notice (PDF)](attachment:att-pdf-1)');
    });

    it('mémorise la sélection et résiste à la perte de focus', () => {
      component.postForm.get('content')?.setValue('Premier paragraphe.\n\nDeuxième paragraphe.');
      // Simule une sélection mémorisée avant le clic sur un bouton externe
      component.lastSelectionStart = 19;
      component.lastSelectionEnd = 19;

      // Appel sans passer de position explicite (comme lors d'un clic sur la carte de PJ)
      component.insertSnippetAtCursor('💡 Conseil d atelier');

      const content = component.postForm.get('content')?.value;
      expect(content).toContain('Premier paragraphe.\n\n💡 Conseil d atelier\n\nDeuxième paragraphe.');
    });

    it('distingue les types de fichiers : image, PDF, audio et archive', () => {
      const imgSnippet = component.generateAttachmentSnippet({ name: 'photo.jpg', id: 'img-1' });
      expect(imgSnippet).toBe('![photo.jpg](attachment:img-1)');

      const pdfSnippet = component.generateAttachmentSnippet({ name: 'manuel.pdf', id: 'pdf-2' });
      expect(pdfSnippet).toBe('[📄 Télécharger manuel.pdf (PDF)](attachment:pdf-2)');

      const audioSnippet = component.generateAttachmentSnippet({ name: 'piste.mp3', id: 'audio-3' });
      expect(audioSnippet).toBe('[🎵 Écouter piste.mp3 (Audio)](attachment:audio-3)');

      const zipSnippet = component.generateAttachmentSnippet({ name: 'fichiers.zip', id: 'zip-4' });
      expect(zipSnippet).toBe('[📎 fichiers.zip](attachment:zip-4)');
    });

    it('gère le dépôt glisser-déposer de plusieurs fichiers avec création de jetons temporaires', () => {
      const file1 = new File(['img'], 'plan.png', { type: 'image/png' });
      const file2 = new File(['pdf'], 'schema.pdf', { type: 'application/pdf' });

      component.postForm.get('content')?.setValue('Voici les documents joints : ');
      component.lastSelectionStart = 28;
      component.lastSelectionEnd = 28;

      component.handleDroppedFiles([file1, file2], 28);

      expect(component.creationSelectedFiles().length).toBe(2);
      const content = component.postForm.get('content')?.value;
      expect(content).toContain('![plan.png](attachment:temp:');
      expect(content).toContain('[📄 Télécharger schema.pdf (PDF)](attachment:temp:');
      expect(component.insertionNotice()).toContain('2 pièce(s) jointe(s) sélectionnée(s) et insérée(s)');
    });

    it('remplace les jetons temporaires par les identifiants définitifs lors de la sauvegarde du post', () => {
      const imgFile = new File(['bytes'], 'montage.png', { type: 'image/png' });
      component.creationSelectedFiles.set([imgFile]);
      const tempId = component.getTempIdForFile(imgFile);

      component.postForm.setValue({
        title: 'Tutoriel avec image locale',
        shortDescription: 'Description valide de plus de 10 caractères.',
        content: `Introduction\n\n![montage.png](attachment:temp:${tempId})\n\nConclusion`,
        category: 'Lego',
        tagsInput: 'diy, lego',
      });

      const createdPost = {
        ...mockPost,
        id: 'post-new-1',
        title: 'Tutoriel avec image locale',
        content: `Introduction\n\n![montage.png](attachment:temp:${tempId})\n\nConclusion`,
      };
      postServiceMock.createPost.mockReturnValue(of(createdPost));

      const realAttachment: AttachmentInfo = {
        id: 'real-att-999',
        originalName: 'montage.png',
        mimeType: 'image/png',
        size: 1024,
        family: 'image',
        downloadUrl: '/api/posts/post-new-1/attachments/real-att-999',
        isCover: false,
      };
      postServiceMock.uploadAttachments.mockReturnValue(of([realAttachment]));
      postServiceMock.updatePost.mockReturnValue(of({ ...createdPost, content: 'updated' }));

      component.onSubmit();

      expect(postServiceMock.createPost).toHaveBeenCalled();
      expect(postServiceMock.uploadAttachments).toHaveBeenCalledWith('post-new-1', [imgFile]);
      // updatePost doit avoir été appelé avec le token définitif
      expect(postServiceMock.updatePost).toHaveBeenCalledWith(
        'post-new-1',
        expect.objectContaining({
          content: expect.stringContaining('![montage.png](attachment:real-att-999)'),
        })
      );
      expect(component.successMessage()).toContain('créé avec succès avec 1 pièce(s) jointe(s)');
    });

    it('en mode édition d un brouillon, téléverse immédiatement les fichiers déposés et insère les identifiants réels', () => {
      component.startEdit(mockPost);
      const droppedFile = new File(['audio-data'], 'son.mp3', { type: 'audio/mpeg' });

      const uploadedAtt: AttachmentInfo = {
        id: 'att-audio-777',
        originalName: 'son.mp3',
        mimeType: 'audio/mpeg',
        size: 5000,
        family: 'audio',
        downloadUrl: '/api/posts/post-1/attachments/att-audio-777',
        isCover: false,
      };
      postServiceMock.uploadAttachments.mockReturnValue(of([uploadedAtt]));

      component.handleDroppedFiles([droppedFile], 10);

      expect(postServiceMock.uploadAttachments).toHaveBeenCalledWith(mockPost.id, [droppedFile]);
      const content = component.postForm.get('content')?.value;
      expect(content).toContain('[🎵 Écouter son.mp3 (Audio)](attachment:att-audio-777)');
      expect(component.insertionNotice()).toContain('téléversée(s) et insérée(s)');
    });

    it('génère un aperçu fidèle dans previewHtml avec rendu des éléments in-text', () => {
      const postWithAtt: PostAuthorManagement = {
        ...mockPost,
        attachments: [
          {
            id: 'att-1',
            originalName: 'schema.png',
            mimeType: 'image/png',
            size: 1024,
            family: 'image',
            downloadUrl: '/api/posts/post-1/attachments/att-1',
            isCover: true,
          },
        ],
      };
      component.posts.set([postWithAtt]);
      component.startEdit(postWithAtt);

      component.postForm.get('content')?.setValue(
        '# Mon Projet\n\n![schema.png](attachment:att-1)\n\nFin.'
      );

      const html = component.previewHtml();
      expect(html).toContain('<h2 class="tutorial-h2 font-display">Mon Projet</h2>');
      expect(html).toContain('<figure class="tutorial-inline-image-box">');
      expect(html).toContain('schema.png');
    });

    describe('calculateDropPosition & replis de placement', () => {
      it('utilise caretPositionFromPoint si le noeud ciblé est le textarea', () => {
        const textarea = document.createElement('textarea');
        textarea.value = 'Ligne 1\nLigne 2\nLigne 3';

        const mockCaretPos = {
          offsetNode: textarea,
          offset: 14,
        };
        (document as any).caretPositionFromPoint = vi.fn().mockReturnValue(mockCaretPos);

        const mockDragEvent = { clientX: 120, clientY: 80 } as DragEvent;
        const pos = component.calculateDropPosition(textarea, mockDragEvent);

        expect(pos).toBe(14);
        delete (document as any).caretPositionFromPoint;
      });

      it('ignore caretPositionFromPoint si le noeud ciblé n\'est pas le textarea et utilise le repli du curseur', () => {
        const textarea = document.createElement('textarea');
        textarea.value = 'Texte initial';
        component.lastSelectionStart = 6;

        const mockCaretPosOther = {
          offsetNode: document.body,
          offset: 2,
        };
        (document as any).caretPositionFromPoint = vi.fn().mockReturnValue(mockCaretPosOther);

        const mockDragEvent = { clientX: 50, clientY: 50 } as DragEvent;
        const pos = component.calculateDropPosition(textarea, mockDragEvent);

        expect(pos).toBe(6);
        delete (document as any).caretPositionFromPoint;
      });

      it('replie sur la fin du texte si aucune position de curseur n\'est disponible', () => {
        const textarea = document.createElement('textarea');
        textarea.value = 'Fin du projet';
        component.lastSelectionStart = -1;

        const mockDragEvent = { clientX: 0, clientY: 0 } as DragEvent;
        const pos = component.calculateDropPosition(textarea, mockDragEvent);

        expect(pos).toBe('Fin du projet'.length);
      });
    });

    it('précharge l image de couverture en Blob authentifié pour un brouillon (status: draft) afin d éviter un 404 dans <img>', () => {
      const createObjSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockImplementation(() => 'blob:http://localhost/draft-cover-blob');
      const revokeObjSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const draftWithCover: PostAuthorManagement = {
        ...mockPost,
        id: 'draft-jojo',
        title: 'Jojo',
        status: 'draft',
        coverUrl: '/api/posts/draft-jojo/attachments/att-cover-1',
        attachments: [
          {
            id: 'att-cover-1',
            originalName: 'jojo-cover.png',
            mimeType: 'image/png',
            size: 2048,
            family: 'image',
            downloadUrl: '/api/posts/draft-jojo/attachments/att-cover-1',
            isCover: true,
          },
        ],
      };

      const fakeBlob = new Blob(['png-bytes'], { type: 'image/png' });
      (postServiceMock as any).getAttachmentBlob = vi.fn().mockReturnValue(of(fakeBlob));
      postServiceMock.getMyPosts.mockReturnValue(
        of({
          docs: [draftWithCover],
          totalDocs: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        })
      );

      component.loadPosts(1);

      expect((postServiceMock as any).getAttachmentBlob).toHaveBeenCalledWith(
        'draft-jojo',
        'att-cover-1'
      );
      const cover = component.getPostFirstImage(draftWithCover);
      expect(cover).not.toBeNull();
      expect(cover?.downloadUrl).toBe('blob:http://localhost/draft-cover-blob');

      createObjSpy.mockRestore();
      revokeObjSpy.mockRestore();
    });
  });
});


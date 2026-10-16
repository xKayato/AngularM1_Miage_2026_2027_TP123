import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { PostService } from '../../shared/services/post.service';
import { MarkdownService } from '../../shared/services/markdown.service';
import {
  AttachmentInfo,
  Category,
  CreatePostDto,
  PostAuthorManagement,
  PostVisibility,
  UpdatePostDto,
} from '../../shared/models/post.model';

const CATEGORIES: Category[] = [
  'Lego',
  'Papercraft',
  'Origami',
  'Musique',
  'Modèles 3D',
  'Autre',
];

const VISIBILITIES: Array<{ value: PostVisibility; label: string }> = [
  { value: 'public', label: 'Public (accessible à tous)' },
  { value: 'followers', label: 'Followers uniquement' },
  { value: 'subscribers', label: 'Abonnés (30j) uniquement' },
  { value: 'link', label: 'Lien secret (non répertorié)' },
];

const TAG_REGEX = /^[a-z0-9-]+$/;

@Component({
  selector: 'app-posts-management-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './posts-management-page.html',
  styleUrl: './posts-management-page.css',
})
export class PostsManagementPageComponent implements OnInit {
  private readonly postService = inject(PostService);
  private readonly markdownService = inject(MarkdownService);
  private readonly fb = inject(FormBuilder);

  readonly categories = CATEGORIES;
  readonly visibilities = VISIBILITIES;

  // Signaux d'état
  readonly posts = signal<PostAuthorManagement[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly activeFilter = signal<'all' | 'draft' | 'published' | 'archived'>('all');
  readonly currentView = signal<'list' | 'editor'>('list');
  readonly editingPostId = signal<string | null>(null);

  // Modal / Sélecteur de publication
  readonly publishingPost = signal<PostAuthorManagement | null>(null);
  readonly selectedVisibility = signal<PostVisibility>('public');

  // Modal / Gestion des pièces jointes (Mission 3)
  readonly attachmentsModalPost = signal<PostAuthorManagement | null>(null);
  readonly selectedFiles = signal<File[]>([]);
  readonly uploadingAttachments = signal<boolean>(false);
  readonly attachmentsError = signal<string | null>(null);

  // Téléversement transparent des pièces jointes dès la création initiale
  readonly creationSelectedFiles = signal<File[]>([]);
  readonly creationFilesError = signal<string | null>(null);
  readonly creationUploadProgress = signal<{ step: string } | null>(null);
  readonly totalCreationFilesSize = computed(() =>
    this.creationSelectedFiles().reduce((sum, f) => sum + f.size, 0)
  );

  // Pagination
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalDocs = signal<number>(0);

  // Formulaire réactif pour création / édition de brouillon
  readonly postForm: FormGroup = this.fb.group({
    title: [
      '',
      [Validators.required, Validators.minLength(3), Validators.maxLength(120)],
    ],
    shortDescription: [
      '',
      [Validators.required, Validators.minLength(10), Validators.maxLength(300)],
    ],
    content: ['', [Validators.required, Validators.minLength(10)]],
    category: ['Lego' as Category, [Validators.required]],
    tagsInput: ['', [Validators.required]],
  });

  // Calcul dynamique et déterministe de la prévisualisation des tags normalisés
  readonly normalizedTagsPreview = computed(() => {
    // Note: on utilise la valeur courante du contrôle sans effet de bord
    return this.parseAndNormalizeTags(this.postForm.get('tagsInput')?.value || '');
  });

  ngOnInit(): void {
    this.loadPosts();
  }

  loadPosts(page = 1): void {
    this.loading.set(true);
    this.error.set(null);

    this.postService
      .getMyPosts({
        page,
        limit: 10,
        status: this.activeFilter(),
      })
      .subscribe({
        next: (pageData) => {
          const list = pageData.docs || pageData.items || [];
          const total = pageData.totalDocs ?? pageData.total ?? 0;
          const pages = pageData.totalPages ?? pageData.pages ?? 1;
          this.posts.set(list);
          this.currentPage.set(pageData.page);
          this.totalPages.set(pages);
          this.totalDocs.set(total);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(
            err.error?.message || 'Erreur lors du chargement de vos posts.',
          );
          this.loading.set(false);
        },
      });
  }

  setFilter(filter: 'all' | 'draft' | 'published' | 'archived'): void {
    this.activeFilter.set(filter);
    this.currentPage.set(1);
    this.loadPosts(1);
  }

  startCreate(): void {
    this.editingPostId.set(null);
    this.error.set(null);
    this.successMessage.set(null);
    this.creationSelectedFiles.set([]);
    this.creationFilesError.set(null);
    this.creationUploadProgress.set(null);
    this.postForm.reset({
      title: '',
      shortDescription: '',
      content: '',
      category: 'Lego',
      tagsInput: '',
    });
    this.currentView.set('editor');
  }

  startEdit(post: PostAuthorManagement): void {
    if (post.status === 'archived') {
      this.error.set('Un post archivé ne peut pas être modifié.');
      return;
    }

    this.editingPostId.set(post.id);
    this.error.set(null);
    this.successMessage.set(null);
    this.creationSelectedFiles.set([]);
    this.creationFilesError.set(null);
    this.creationUploadProgress.set(null);
    this.postForm.patchValue({
      title: post.title,
      shortDescription: post.shortDescription,
      content: post.content,
      category: post.category,
      tagsInput: post.tags.join(', '),
    });
    this.currentView.set('editor');
  }

  cancelEditor(): void {
    this.currentView.set('list');
    this.editingPostId.set(null);
    this.error.set(null);
    this.creationSelectedFiles.set([]);
    this.creationFilesError.set(null);
    this.creationUploadProgress.set(null);
  }

  onCreationFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const newFiles = Array.from(input.files);
    const existing = this.creationSelectedFiles();
    const combined = [...existing, ...newFiles];

    const validation = this.validateSelectedFiles(combined, []);
    if (!validation.valid) {
      this.creationFilesError.set(validation.error);
      input.value = '';
      return;
    }

    this.creationFilesError.set(null);
    this.creationSelectedFiles.set(combined);
    input.value = '';
  }

  removeCreationFile(index: number): void {
    this.creationSelectedFiles.update((files) => files.filter((_, i) => i !== index));
    this.creationFilesError.set(null);
  }

  getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return '🖼️';
    if (ext === 'pdf') return '📄';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return '🎵';
    return '📎';
  }

  onSubmit(): void {
    if (this.postForm.invalid) {
      this.postForm.markAllAsTouched();
      return;
    }

    const { valid, tags, error } = this.parseAndNormalizeTags(
      this.postForm.value.tagsInput || '',
    );
    if (!valid || !tags || tags.length === 0) {
      this.error.set(error || 'Veuillez saisir entre 1 et 10 tags valides.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.successMessage.set(null);

    const formVal = this.postForm.value;
    const isEdit = !!this.editingPostId();

    if (isEdit) {
      const dto: UpdatePostDto = {
        title: formVal.title.trim(),
        shortDescription: formVal.shortDescription.trim(),
        content: formVal.content.trim(),
        category: formVal.category,
        tags,
      };

      this.postService.updatePost(this.editingPostId()!, dto).subscribe({
        next: (updated) => {
          this.loading.set(false);
          this.successMessage.set(`Post "${updated.title}" mis à jour avec succès.`);
          this.currentView.set('list');
          this.editingPostId.set(null);
          this.loadPosts(this.currentPage());
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err.error?.message || 'Erreur lors de la mise à jour du post.',
          );
        },
      });
    } else {
      const dto: CreatePostDto = {
        title: formVal.title.trim(),
        shortDescription: formVal.shortDescription.trim(),
        content: formVal.content.trim(),
        category: formVal.category,
        tags,
      };

      const filesToUpload = this.creationSelectedFiles();

      if (filesToUpload.length === 0) {
        this.postService.createPost(dto).subscribe({
          next: (created) => {
            this.loading.set(false);
            this.successMessage.set(
              `Brouillon "${created.title}" créé avec succès !`,
            );
            this.currentView.set('list');
            this.loadPosts(1);
          },
          error: (err) => {
            this.loading.set(false);
            this.error.set(
              err.error?.message || 'Erreur lors de la création du brouillon.',
            );
          },
        });
      } else {
        this.creationUploadProgress.set({
          step: `Étape 1/2 : Enregistrement du brouillon...`,
        });

        this.postService.createPost(dto).subscribe({
          next: (created) => {
            this.creationUploadProgress.set({
              step: `Étape 2/2 : Téléversement automatique de ${filesToUpload.length} pièce(s) jointe(s)...`,
            });

            this.postService.uploadAttachments(created.id, filesToUpload).subscribe({
              next: (added) => {
                this.loading.set(false);
                this.creationUploadProgress.set(null);
                this.creationSelectedFiles.set([]);
                this.successMessage.set(
                  `Projet "${created.title}" créé avec succès avec ${added.length} pièce(s) jointe(s) !`,
                );
                this.currentView.set('list');
                this.loadPosts(1);
              },
              error: (uploadErr) => {
                this.loading.set(false);
                this.creationUploadProgress.set(null);
                this.creationSelectedFiles.set([]);
                this.currentView.set('list');
                this.loadPosts(1);
                this.error.set(
                  `Le brouillon "${created.title}" a bien été créé, mais l'envoi des pièces jointes a échoué : ${
                    uploadErr.error?.message || "Erreur réseau lors de l'envoi des fichiers"
                  }. Vous pouvez retenter l'envoi depuis vos postes.`,
                );
              },
            });
          },
          error: (err) => {
            this.loading.set(false);
            this.creationUploadProgress.set(null);
            this.error.set(
              err.error?.message || 'Erreur lors de la création du brouillon.',
            );
          },
        });
      }
    }
  }

  openPublishModal(post: PostAuthorManagement): void {
    if (post.status === 'archived') {
      this.error.set('Un post archivé ne peut pas être publié.');
      return;
    }
    this.publishingPost.set(post);
    this.selectedVisibility.set(post.visibility || 'public');
  }

  closePublishModal(): void {
    this.publishingPost.set(null);
  }

  confirmPublish(): void {
    const post = this.publishingPost();
    if (!post) return;

    this.loading.set(true);
    this.error.set(null);

    this.postService
      .publishPost(post.id, this.selectedVisibility())
      .subscribe({
        next: (published) => {
          this.loading.set(false);
          this.publishingPost.set(null);
          this.successMessage.set(
            `Post "${published.title}" publié avec la visibilité ${published.visibility}.`,
          );
          this.loadPosts(this.currentPage());
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err.error?.message || 'Erreur lors de la publication du post.',
          );
        },
      });
  }

  unpublishPost(post: PostAuthorManagement): void {
    if (post.status === 'archived') {
      this.error.set('Un post archivé ne peut pas être dépublié.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.postService.unpublishPost(post.id).subscribe({
      next: (draft) => {
        this.loading.set(false);
        this.successMessage.set(
          `Post "${draft.title}" repassé en brouillon avec succès.`,
        );
        this.loadPosts(this.currentPage());
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err.error?.message || 'Erreur lors du retour en brouillon.',
        );
      },
    });
  }

  /**
   * Découpe, normalise (minuscules, trim) et valide déterministement la liste des tags.
   */
  parseAndNormalizeTags(rawInput: string): {
    valid: boolean;
    tags: string[];
    error: string | null;
  } {
    if (!rawInput || !rawInput.trim()) {
      return { valid: false, tags: [], error: 'Au moins un tag est requis.' };
    }

    const parts = rawInput
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const part of parts) {
      const norm = part.toLowerCase();
      if (!TAG_REGEX.test(norm)) {
        return {
          valid: false,
          tags: [],
          error: `Tag invalide "${part}". Caractères autorisés : minuscules, chiffres et tirets.`,
        };
      }
      if (seen.has(norm)) {
        return {
          valid: false,
          tags: [],
          error: `Tag en doublon détecté : "${part}".`,
        };
      }
      seen.add(norm);
      normalized.push(norm);
    }

    if (normalized.length < 1 || normalized.length > 10) {
      return {
        valid: false,
        tags: normalized,
        error: 'Vous devez renseigner entre 1 et 10 tags.',
      };
    }

    return { valid: true, tags: normalized, error: null };
  }

  // --- GESTION DES PIÈCES JOINTES (MISSION 3) ---

  openAttachmentsModal(post: PostAuthorManagement): void {
    if (post.status === 'archived') {
      this.error.set('Un post archivé ne peut pas recevoir de pièces jointes.');
      return;
    }
    this.attachmentsModalPost.set(post);
    this.selectedFiles.set([]);
    this.attachmentsError.set(null);
  }

  closeAttachmentsModal(): void {
    if (this.uploadingAttachments()) return;
    this.attachmentsModalPost.set(null);
    this.selectedFiles.set([]);
    this.attachmentsError.set(null);
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.selectedFiles.set([]);
      this.attachmentsError.set(null);
      return;
    }

    const files = Array.from(input.files);
    const post = this.attachmentsModalPost();
    const existing = post?.attachments || [];

    const validation = this.validateSelectedFiles(files, existing);
    if (!validation.valid) {
      this.attachmentsError.set(validation.error);
      this.selectedFiles.set([]);
      input.value = '';
      return;
    }

    this.attachmentsError.set(null);
    this.selectedFiles.set(files);
  }

  uploadSelectedFiles(): void {
    const post = this.attachmentsModalPost();
    const files = this.selectedFiles();

    if (!post || files.length === 0 || this.uploadingAttachments()) {
      return;
    }

    this.uploadingAttachments.set(true);
    this.attachmentsError.set(null);

    this.postService.uploadAttachments(post.id, files).subscribe({
      next: (added) => {
        this.uploadingAttachments.set(false);
        this.successMessage.set(
          `${added.length} pièce(s) jointe(s) ajoutée(s) avec succès au projet "${post.title}".`
        );
        this.closeAttachmentsModal();
        this.loadPosts(this.currentPage());
      },
      error: (err) => {
        this.uploadingAttachments.set(false);
        this.attachmentsError.set(
          err.error?.message || "Erreur lors de l'envoi des pièces jointes."
        );
      },
    });
  }

  validateSelectedFiles(
    newFiles: File[],
    existing: AttachmentInfo[]
  ): { valid: boolean; error: string | null } {
    if (newFiles.length === 0) {
      return { valid: false, error: 'Aucun fichier sélectionné.' };
    }

    if (existing.length + newFiles.length > 10) {
      return {
        valid: false,
        error: `Le nombre total de pièces jointes ne peut pas dépasser 10 (${existing.length} existante(s) + ${newFiles.length} nouvelle(s) = ${existing.length + newFiles.length}).`,
      };
    }

    const existingBytes = existing.reduce((sum, a) => sum + (a.size || 0), 0);
    const newBytes = newFiles.reduce((sum, f) => sum + f.size, 0);
    if (existingBytes + newBytes > 50 * 1024 * 1024) {
      return {
        valid: false,
        error: `Le cumul des pièces jointes dépasse 50 Mo (${((existingBytes + newBytes) / (1024 * 1024)).toFixed(1)} Mo demandés).`,
      };
    }

    const ALLOWED_EXTS = new Set([
      'jpg', 'jpeg', 'png', 'webp',
      'pdf',
      'mp3', 'wav', 'ogg', 'm4a',
    ]);

    for (const f of newFiles) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_EXTS.has(ext)) {
        return {
          valid: false,
          error: `Le format du fichier "${f.name}" n'est pas autorisé. Formats acceptés : JPEG, PNG, WebP, PDF, MP3, WAV, OGG, M4A.`,
        };
      }

      // Limites individuelles par type
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) && f.size > 5 * 1024 * 1024) {
        return {
          valid: false,
          error: `L'image "${f.name}" (${(f.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite de 5 Mo.`,
        };
      }
      if (ext === 'pdf' && f.size > 10 * 1024 * 1024) {
        return {
          valid: false,
          error: `Le document PDF "${f.name}" (${(f.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite de 10 Mo.`,
        };
      }
      if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext) && f.size > 25 * 1024 * 1024) {
        return {
          valid: false,
          error: `Le fichier audio "${f.name}" (${(f.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite de 25 Mo.`,
        };
      }
    }

    return { valid: true, error: null };
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 o';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  // --- GESTION DE LA COUVERTURE (MISSION 3) ---
  setCover(attachmentId: string | null): void {
    const post = this.attachmentsModalPost();
    if (!post) return;

    this.postService.setCover(post.id, attachmentId).subscribe({
      next: (updated) => {
        this.attachmentsModalPost.set(updated);
        this.successMessage.set(
          attachmentId
            ? 'Couverture du projet mise à jour avec succès.'
            : 'Couverture retirée avec succès.'
        );
        this.loadPosts(this.currentPage());
      },
      error: (err) => {
        this.attachmentsError.set(
          err.error?.message || 'Erreur lors de la modification de la couverture.'
        );
      },
    });
  }

  // --- Outils Éditeur Riche & Insertion Pièces Jointes in-text (Figma Frame 3D) ---
  readonly editorTab = signal<'edit' | 'preview'>('edit');

  readonly currentEditingPost = computed(() => {
    const id = this.editingPostId();
    if (!id) return null;
    return this.posts().find((p) => p.id === id) || null;
  });

  /** Prévisualisation dynamique et sécurisée du Markdown via MarkdownService */
  readonly previewHtml = computed(() => {
    const content = this.postForm.get('content')?.value || '';
    const attachments = this.currentEditingPost()?.attachments || [];
    return this.markdownService.render(content, attachments);
  });

  switchEditorTab(tab: 'edit' | 'preview'): void {
    this.editorTab.set(tab);
  }

  formatEditor(snippet: string): void {
    const contentCtrl = this.postForm.get('content');
    if (!contentCtrl) return;
    const currentVal = contentCtrl.value || '';
    contentCtrl.setValue(currentVal + (currentVal.endsWith('\n') ? '' : '\n') + snippet);
    contentCtrl.markAsDirty();
  }

  insertAttachmentInText(filename: string, meta = ''): void {
    const tag = `\n\n[📎 PIÈCE JOINTE DANS LE TEXTE : ${filename}${meta ? ' (' + meta + ')' : ''}]\n\n`;
    this.formatEditor(tag);
  }

  insertAttachmentMarkdown(att: AttachmentInfo): void {
    if (att.family === 'image') {
      this.formatEditor(`\n\n![${att.originalName}](attachment:${att.id})\n\n`);
    } else {
      this.formatEditor(`\n\n[📎 PIÈCE JOINTE DANS LE TEXTE : ${att.originalName}]\n\n`);
    }
  }

  isAttachmentInContent(filename: string): boolean {
    const content = this.postForm.get('content')?.value || '';
    return content.includes(filename);
  }
}



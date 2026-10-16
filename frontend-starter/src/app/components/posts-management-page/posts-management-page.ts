import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
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

  // Éditeur riche & suivi du curseur / drag-and-drop
  @ViewChild('editorTextarea') editorTextarea?: ElementRef<HTMLTextAreaElement>;
  lastSelectionStart = 0;
  lastSelectionEnd = 0;
  readonly isDragOverEditor = signal<boolean>(false);
  readonly insertionNotice = signal<string | null>(null);
  private noticeTimeout?: any;
  private readonly fileTempIds = new WeakMap<File, string>();
  private tempIdCounter = 0;

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
    this.lastSelectionStart = 0;
    this.lastSelectionEnd = 0;
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
    this.lastSelectionStart = post.content ? post.content.length : 0;
    this.lastSelectionEnd = this.lastSelectionStart;
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
    this.lastSelectionStart = 0;
    this.lastSelectionEnd = 0;
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
          step: `Étape 1/3 : Enregistrement du brouillon...`,
        });

        this.postService.createPost(dto).subscribe({
          next: (created) => {
            this.creationUploadProgress.set({
              step: `Étape 2/3 : Téléversement automatique de ${filesToUpload.length} pièce(s) jointe(s)...`,
            });

            this.postService.uploadAttachments(created.id, filesToUpload).subscribe({
              next: (added) => {
                let finalContent = formVal.content.trim();
                let contentChanged = false;

                filesToUpload.forEach((file, index) => {
                  const tempId = this.getTempIdForFile(file);
                  const matchedAtt =
                    added.find((a) => a.originalName === file.name) || added[index];
                  if (matchedAtt) {
                    const tempToken = `attachment:temp:${tempId}`;
                    const realToken = `attachment:${matchedAtt.id}`;
                    if (finalContent.includes(tempToken)) {
                      finalContent = finalContent.replaceAll(tempToken, realToken);
                      contentChanged = true;
                    }
                  }
                });

                if (contentChanged) {
                  this.creationUploadProgress.set({
                    step: `Étape 3/3 : Finalisation des références dans le tutoriel...`,
                  });
                  const updateDto: UpdatePostDto = {
                    title: created.title,
                    shortDescription: created.shortDescription,
                    content: finalContent,
                    category: created.category,
                    tags,
                  };
                  this.postService.updatePost(created.id, updateDto).subscribe({
                    next: () => {
                      this.finalizePostCreation(created.title, added.length);
                    },
                    error: () => {
                      this.finalizePostCreation(created.title, added.length);
                    },
                  });
                } else {
                  this.finalizePostCreation(created.title, added.length);
                }
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

  private finalizePostCreation(title: string, attachmentsCount: number): void {
    this.loading.set(false);
    this.creationUploadProgress.set(null);
    this.creationSelectedFiles.set([]);
    this.successMessage.set(
      `Projet "${title}" créé avec succès avec ${attachmentsCount} pièce(s) jointe(s) !`,
    );
    this.currentView.set('list');
    this.loadPosts(1);
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

  // --- Outils Éditeur Riche & Insertion Pièces Jointes in-text ---
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

  updateSelection(): void {
    if (this.editorTextarea?.nativeElement) {
      const el = this.editorTextarea.nativeElement;
      this.lastSelectionStart = el.selectionStart;
      this.lastSelectionEnd = el.selectionEnd;
    }
  }

  calculateDropPosition(textarea: HTMLTextAreaElement | undefined, event: DragEvent): number {
    if (!textarea) return 0;

    // 1. Standard W3C CSSOM View (Chromium 128+, Edge, Firefox)
    // Valide strictement que le nœud retourné est bien l'élément TEXTAREA pour obtenir l'offset de caractères exact
    if (typeof document.caretPositionFromPoint === 'function') {
      const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (pos && pos.offsetNode === textarea && typeof pos.offset === 'number') {
        return Math.min(pos.offset, textarea.value.length);
      }
    }

    // 2. Repli : si le textarea a le focus ou un curseur actif utilisateur
    if (document.activeElement === textarea && typeof textarea.selectionStart === 'number' && textarea.selectionStart >= 0) {
      return textarea.selectionStart;
    }

    // 3. Repli : dernière position mémorisée du curseur dans l'éditeur
    if (this.lastSelectionStart >= 0 && this.lastSelectionStart <= textarea.value.length) {
      return this.lastSelectionStart;
    }

    // 4. Repli de sécurité : fin du texte
    return textarea.value.length;
  }

  onEditorDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.isDragOverEditor.set(true);
  }

  onEditorDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOverEditor.set(false);
  }

  onEditorDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOverEditor.set(false);

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const dropIndex = this.calculateDropPosition(this.editorTextarea?.nativeElement, event);
    this.lastSelectionStart = dropIndex;
    this.lastSelectionEnd = dropIndex;

    this.handleDroppedFiles(fileList, dropIndex);
  }

  getFileFamily(filename: string): 'image' | 'pdf' | 'audio' | 'archive' | 'file' {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    return 'file';
  }

  getTempIdForFile(file: File): string {
    let id = this.fileTempIds.get(file);
    if (!id) {
      id = `temp_${Date.now()}_${++this.tempIdCounter}_${file.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      this.fileTempIds.set(file, id);
    }
    return id;
  }

  generateAttachmentSnippet(fileOrAtt: {
    name: string;
    family?: string;
    id?: string;
    tempId?: string;
  }): string {
    const name = fileOrAtt.name;
    const family = fileOrAtt.family || this.getFileFamily(name);
    const token = fileOrAtt.id ? `attachment:${fileOrAtt.id}` : `attachment:temp:${fileOrAtt.tempId}`;

    if (family === 'image') {
      return `![${name}](${token})`;
    } else if (family === 'pdf') {
      return `[📄 Télécharger ${name} (PDF)](${token})`;
    } else if (family === 'audio') {
      return `[🎵 Écouter ${name} (Audio)](${token})`;
    } else {
      return `[📎 ${name}](${token})`;
    }
  }

  showInsertionNotice(message: string): void {
    this.insertionNotice.set(message);
    if (this.noticeTimeout) {
      clearTimeout(this.noticeTimeout);
    }
    this.noticeTimeout = setTimeout(() => {
      this.insertionNotice.set(null);
    }, 3500);
  }

  insertSnippetAtCursor(snippet: string, targetStart?: number, targetEnd?: number): void {
    const textarea = this.editorTextarea?.nativeElement;
    const contentCtrl = this.postForm.get('content');
    if (!contentCtrl) return;

    const currentVal: string = contentCtrl.value || '';
    const start =
      typeof targetStart === 'number'
        ? Math.min(targetStart, currentVal.length)
        : this.lastSelectionStart >= 0
          ? Math.min(this.lastSelectionStart, currentVal.length)
          : currentVal.length;
    const end =
      typeof targetEnd === 'number'
        ? Math.min(targetEnd, currentVal.length)
        : this.lastSelectionEnd >= start
          ? Math.min(this.lastSelectionEnd, currentVal.length)
          : start;

    const before = currentVal.substring(0, start);
    const after = currentVal.substring(end);

    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
    const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');
    const formattedSnippet =
      (needsLeadingNewline ? '\n\n' : '') + snippet + (needsTrailingNewline ? '\n\n' : '');

    const newVal = before + formattedSnippet + after;
    contentCtrl.setValue(newVal);
    contentCtrl.markAsDirty();

    const newCursorPos = before.length + formattedSnippet.length;
    this.lastSelectionStart = newCursorPos;
    this.lastSelectionEnd = newCursorPos;

    if (textarea) {
      textarea.focus();
      setTimeout(() => {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  }

  handleDroppedFiles(fileList: File[], dropIndex: number): void {
    if (this.editingPostId()) {
      // Mode Édition de brouillon existant
      const existing = this.currentEditingPost()?.attachments || [];
      const validation = this.validateSelectedFiles(fileList, existing);
      if (!validation.valid) {
        this.attachmentsError.set(validation.error);
        return;
      }

      this.attachmentsError.set(null);
      this.uploadingAttachments.set(true);

      this.postService.uploadAttachments(this.editingPostId()!, fileList).subscribe({
        next: (added) => {
          this.uploadingAttachments.set(false);
          this.posts.update((list) =>
            list.map((p) => {
              if (p.id === this.editingPostId()) {
                return { ...p, attachments: [...p.attachments, ...added] };
              }
              return p;
            })
          );
          const snippets = added.map((a) =>
            this.generateAttachmentSnippet({
              name: a.originalName,
              family: a.family,
              id: a.id,
            })
          );
          this.insertSnippetAtCursor(snippets.join('\n\n'), dropIndex, dropIndex);
          this.showInsertionNotice(
            `${added.length} pièce(s) jointe(s) téléversée(s) et insérée(s) dans le texte.`
          );
        },
        error: (err) => {
          this.uploadingAttachments.set(false);
          this.attachmentsError.set(
            err.error?.message || "Erreur lors de l'envoi des pièces jointes déposées."
          );
        },
      });
    } else {
      // Mode Création initiale
      const existing = this.creationSelectedFiles();
      const combined = [...existing, ...fileList];
      const validation = this.validateSelectedFiles(combined, []);
      if (!validation.valid) {
        this.creationFilesError.set(validation.error);
        return;
      }

      this.creationFilesError.set(null);
      this.creationSelectedFiles.set(combined);

      const snippets = fileList.map((f) => {
        const tempId = this.getTempIdForFile(f);
        return this.generateAttachmentSnippet({ name: f.name, tempId });
      });

      this.insertSnippetAtCursor(snippets.join('\n\n'), dropIndex, dropIndex);
      this.showInsertionNotice(
        `${fileList.length} pièce(s) jointe(s) sélectionnée(s) et insérée(s) dans le texte.`
      );
    }
  }

  formatEditor(snippet: string): void {
    this.insertSnippetAtCursor(snippet);
  }

  insertAttachmentAtCursor(att: AttachmentInfo): void {
    const snippet = this.generateAttachmentSnippet({
      name: att.originalName,
      family: att.family,
      id: att.id,
    });
    this.insertSnippetAtCursor(snippet);
    this.showInsertionNotice(`"${att.originalName}" inséré à la position du curseur.`);
  }

  insertCreationFileAtCursor(file: File): void {
    const tempId = this.getTempIdForFile(file);
    const snippet = this.generateAttachmentSnippet({ name: file.name, tempId });
    this.insertSnippetAtCursor(snippet);
    this.showInsertionNotice(`"${file.name}" inséré à la position du curseur.`);
  }

  insertAttachmentInText(filename: string, meta = ''): void {
    const tag = `[📎 PIÈCE JOINTE DANS LE TEXTE : ${filename}${meta ? ' (' + meta + ')' : ''}]`;
    this.insertSnippetAtCursor(tag);
  }

  insertAttachmentMarkdown(att: AttachmentInfo): void {
    this.insertAttachmentAtCursor(att);
  }

  isAttachmentInContent(fileOrAtt: AttachmentInfo | File | string): boolean {
    const content = this.postForm.get('content')?.value || '';
    if (typeof fileOrAtt === 'string') {
      return content.includes(fileOrAtt);
    }
    if ('originalName' in fileOrAtt) {
      return (
        content.includes(`attachment:${fileOrAtt.id}`) ||
        content.includes(fileOrAtt.originalName)
      );
    }
    const tempId = this.getTempIdForFile(fileOrAtt);
    return (
      content.includes(`attachment:temp:${tempId}`) ||
      content.includes(fileOrAtt.name)
    );
  }
}



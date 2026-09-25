import { Component, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { debounceTime, distinctUntilChanged, Subscription } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

export const ALLOWED_AUDIO_MIMES: readonly string[] = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
];

export const MAX_AUDIO_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo

export const ALLOWED_COVER_MIMES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_COVER_FILE_SIZE = 2 * 1024 * 1024; // 2 Mo

export function getFrenchPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Pistes par page :';
  intl.nextPageLabel = 'Page suivante';
  intl.previousPageLabel = 'Page précédente';
  intl.firstPageLabel = 'Première page';
  intl.lastPageLabel = 'Dernière page';
  intl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 sur ${length}`;
    }
    const startIndex = page * pageSize;
    const endIndex = startIndex < length ? Math.min(startIndex + pageSize, length) : startIndex + pageSize;
    return `${startIndex + 1} – ${endIndex} sur ${length}`;
  };
  return intl;
}

@Component({
  imports: [ReactiveFormsModule, MatPaginator],
  providers: [{ provide: MatPaginatorIntl, useFactory: getFrenchPaginatorIntl }],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnInit, OnDestroy {
  private readonly service = inject(TrackService);
  private loadSubscription?: Subscription;
  private playSubscription?: Subscription;
  private searchSubscription?: Subscription;
  private searchDebounceSubscription?: Subscription;
  private coverSubscriptions: Subscription[] = [];

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('coverInput') coverInput?: ElementRef<HTMLInputElement>;

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly limit = signal(5);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly uploading = signal(false);
  readonly uploadProgress = signal<number | null>(null);
  readonly uploadStatusText = signal<string>('');
  readonly deletingTrackId = signal<string | null>(null);
  readonly deleteError = signal('');
  readonly deleteSuccess = signal('');
  readonly currentTrack = signal<Track | null>(null);
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly audioUrl = signal('');
  readonly coverPreviewUrl = signal<string | null>(null);
  readonly coverUrls = signal<Record<string, string>>({});
  readonly title = new FormControl('', { nonNullable: true });
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly searchQuery = signal('');
  file?: File;
  coverFile?: File;

  ngOnInit(): void {
    this.load();

    this.searchSubscription = this.searchControl.valueChanges.subscribe((val) => {
      this.searchQuery.set(val);
    });

    this.searchDebounceSubscription = this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
  }

  ngOnDestroy(): void {
    this.loadSubscription?.unsubscribe();
    this.playSubscription?.unsubscribe();
    this.searchSubscription?.unsubscribe();
    this.searchDebounceSubscription?.unsubscribe();
    this.revokeCoverUrls();
    const preview = this.coverPreviewUrl();
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    const currentUrl = this.audioUrl();
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      this.audioUrl.set('');
    }
  }

  private revokeCoverUrls(): void {
    const current = this.coverUrls();
    Object.values(current).forEach((url) => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    this.coverUrls.set({});
    this.coverSubscriptions.forEach((sub) => sub.unsubscribe());
    this.coverSubscriptions = [];
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.searchQuery.set('');
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0];
    this.uploadError.set('');
    this.uploadSuccess.set('');
    this.uploadProgress.set(null);
    this.uploadStatusText.set('');
    console.debug('[TracksPage] Fichier audio sélectionné', this.file?.name);
  }

  chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!ALLOWED_COVER_MIMES.includes(file.type)) {
      this.uploadError.set('Format d\'image non accepté. Formats autorisés : JPEG, PNG, WebP.');
      input.value = '';
      return;
    }

    if (file.size > MAX_COVER_FILE_SIZE) {
      this.uploadError.set('L\'image de couverture ne doit pas dépasser 2 Mo.');
      input.value = '';
      return;
    }

    this.coverFile = file;
    this.uploadError.set('');
    const prev = this.coverPreviewUrl();
    if (prev) {
      URL.revokeObjectURL(prev);
    }
    this.coverPreviewUrl.set(URL.createObjectURL(file));
  }

  clearCover(): void {
    this.coverFile = undefined;
    const prev = this.coverPreviewUrl();
    if (prev) {
      URL.revokeObjectURL(prev);
    }
    this.coverPreviewUrl.set(null);
    if (this.coverInput?.nativeElement) {
      this.coverInput.nativeElement.value = '';
    }
  }

  getCoverUrl(track: Track): string {
    return this.coverUrls()[track.id] || '/default-cover.svg';
  }

  onCoverImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && !img.src.endsWith('/default-cover.svg')) {
      img.src = '/default-cover.svg';
    }
  }

  deleteCover(track: Track): void {
    const confirmed = window.confirm(`Voulez-vous supprimer la pochette de « ${track.title} » ?`);
    if (!confirmed) return;

    this.service.deleteCover(track.id).subscribe({
      next: () => {
        const currentUrl = this.coverUrls()[track.id];
        if (currentUrl && currentUrl.startsWith('blob:')) {
          URL.revokeObjectURL(currentUrl);
        }
        this.coverUrls.update((map) => {
          const copy = { ...map };
          delete copy[track.id];
          return copy;
        });
        track.hasCover = false;
        track.coverUrl = null;
        this.deleteSuccess.set(`La pochette de « ${track.title} » a été supprimée.`);
      },
      error: (err) => {
        console.error('[TracksPage] Erreur suppression cover', err);
        if (err instanceof HttpErrorResponse) {
          this.deleteError.set(err.error?.message ?? 'Impossible de supprimer la couverture.');
        } else {
          this.deleteError.set('Erreur inattendue lors de la suppression de la couverture.');
        }
      },
    });
  }

  load(): void {
    // Annuler la requête en cours pour éviter les collisions de réponses
    this.loadSubscription?.unsubscribe();

    this.loading.set(true);
    this.error.set('');

    const targetPage = this.page();
    const targetLimit = this.limit();
    const targetTitle = this.searchControl.value.trim();

    const list$ = targetTitle
      ? this.service.list(targetPage, targetLimit, targetTitle)
      : this.service.list(targetPage, targetLimit);

    this.loadSubscription = list$.subscribe({
      next: (response) => {
        // Double sécurité anti-collision : ne pas appliquer si la page ou la recherche a changé entre-temps
        if (this.page() !== targetPage || this.searchControl.value.trim() !== targetTitle) {
          return;
        }

        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.revokeCoverUrls();
        this.tracks.set(response.items);
        this.pages.set(Math.max(1, response.pages));
        this.total.set(response.total);
        this.loading.set(false);

        // Récupération des couvertures des pistes authentifiées
        for (const track of response.items) {
          if (track.hasCover) {
            const sub = this.service.cover(track.id).subscribe({
              next: (blob) => {
                const blobUrl = URL.createObjectURL(blob);
                this.coverUrls.update((map) => ({ ...map, [track.id]: blobUrl }));
              },
              error: (err) => {
                console.warn(`[TracksPage] Couverture inaccessible pour ${track.id}`, err);
              },
            });
            this.coverSubscriptions.push(sub);
          }
        }
      },
      error: (err: unknown) => {
        if (this.page() !== targetPage || this.searchControl.value.trim() !== targetTitle) {
          return;
        }
        this.loading.set(false);
        console.error('[TracksPage] Chargement impossible', err);
        if (err instanceof HttpErrorResponse) {
          this.error.set(err.error?.message ?? 'Impossible de charger la bibliothèque.');
        } else {
          this.error.set('Erreur inattendue lors du chargement des pistes.');
        }
      },
    });
  }

  go(targetPage: number): void {
    if (targetPage < 1 || (this.pages() > 0 && targetPage > this.pages())) {
      return;
    }
    this.page.set(targetPage);
    this.load();
  }

  onPageChange(event: PageEvent): void {
    if (event.pageSize !== this.limit()) {
      // Si la taille de page change, retour à la première page
      this.limit.set(event.pageSize);
      this.page.set(1);
    } else {
      // Conversion pageIndex (0-indexé dans Material) vers page API (1-indexé)
      this.page.set(event.pageIndex + 1);
    }
    this.load();
  }

  upload(): void {
    // Empêcher la double soumission
    if (this.uploading()) {
      return;
    }

    this.uploadError.set('');
    this.uploadSuccess.set('');

    // 1. Validation présence du fichier
    if (!this.file) {
      this.uploadError.set('Veuillez sélectionner un fichier audio.');
      return;
    }

    // 2. Validation format MIME autorisé par le backend
    if (!ALLOWED_AUDIO_MIMES.includes(this.file.type)) {
      this.uploadError.set('Format audio non accepté. Formats autorisés : MP3, WAV, OGG, M4A.');
      return;
    }

    // 3. Validation taille maximale 25 Mo
    if (this.file.size > MAX_AUDIO_FILE_SIZE) {
      this.uploadError.set('La taille du fichier dépasse la limite maximale autorisée de 25 Mo.');
      return;
    }

    // 4. Validation couverture si présente
    if (this.coverFile) {
      if (!ALLOWED_COVER_MIMES.includes(this.coverFile.type)) {
        this.uploadError.set('Format d\'image non accepté. Formats autorisés : JPEG, PNG, WebP.');
        return;
      }
      if (this.coverFile.size > MAX_COVER_FILE_SIZE) {
        this.uploadError.set('L\'image de couverture ne doit pas dépasser 2 Mo.');
        return;
      }
    }

    // 5. Validation du titre (pas d'espaces uniquement si renseigné)
    const titleTrimmed = this.title.value.trim();
    if (this.title.value.length > 0 && titleTrimmed.length === 0) {
      this.uploadError.set("Le titre ne peut pas être composé uniquement d'espaces.");
      return;
    }

    const effectiveTitle = titleTrimmed || this.file.name;

    this.uploading.set(true);
    this.uploadProgress.set(null);
    this.uploadStatusText.set("Initialisation de l'envoi…");

    this.service.upload(this.file, effectiveTitle, this.coverFile).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          if (event.total && event.total > 0) {
            const progress = Math.round((100 * event.loaded) / event.total);
            this.uploadProgress.set(progress);
            if (progress < 100) {
              this.uploadStatusText.set(`Envoi en cours : ${progress} %`);
            } else {
              // 100 % des octets envoyés, mais le serveur traite encore la requête
              this.uploadStatusText.set('Envoi terminé. Traitement par le serveur en cours…');
            }
          } else {
            // Taille totale indéterminée
            this.uploadProgress.set(null);
            this.uploadStatusText.set('Envoi en cours (taille totale indéterminée)…');
          }
        } else if (event.type === HttpEventType.Response) {
          const track = event.body as Track;
          console.debug('[TracksPage] Piste envoyée', track?.id);
          this.uploading.set(false);
          this.uploadProgress.set(null);
          this.uploadStatusText.set('');
          this.uploadSuccess.set(`La piste « ${track?.title ?? effectiveTitle} » a été ajoutée avec succès.`);
          this.title.setValue('');
          this.file = undefined;
          this.clearCover();
          if (this.fileInput?.nativeElement) {
            this.fileInput.nativeElement.value = '';
          }
          this.page.set(1);
          this.load();
        }
      },
      error: (err: unknown) => {
        this.uploading.set(false);
        this.uploadProgress.set(null);
        this.uploadStatusText.set('');
        console.error('[TracksPage] Envoi impossible', err);
        if (err instanceof HttpErrorResponse) {
          this.uploadError.set(err.error?.message ?? "Échec de l'envoi du fichier.");
        } else {
          this.uploadError.set("Erreur inattendue lors de l'envoi.");
        }
      },
    });
  }

  deleteTrack(track: Track): void {
    // Bloquer double soumission ou suppression concurrente
    if (this.deletingTrackId()) {
      return;
    }

    this.deleteError.set('');
    this.deleteSuccess.set('');

    const confirmed = window.confirm(`Voulez-vous vraiment supprimer la piste « ${track.title} » ?`);
    if (!confirmed) {
      return;
    }

    this.deletingTrackId.set(track.id);

    this.service.delete(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée avec succès', track.id);
        this.deletingTrackId.set(null);
        this.deleteSuccess.set(`La piste « ${track.title} » a été supprimée.`);

        // Si la piste supprimée était en cours d'écoute, stopper le lecteur et révoquer l'ObjectURL
        if (this.currentTrack()?.id === track.id) {
          const currentUrl = this.audioUrl();
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }
          this.audioUrl.set('');
          this.currentTrack.set(null);
        }

        // Si la suppression vide la dernière page (un seul élément sur la page courante et page > 1)
        if (this.tracks().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }

        this.load();
      },
      error: (err: unknown) => {
        this.deletingTrackId.set(null);
        console.error('[TracksPage] Erreur de suppression', err);
        if (err instanceof HttpErrorResponse) {
          this.deleteError.set(err.error?.message ?? 'Impossible de supprimer la piste.');
        } else {
          this.deleteError.set('Erreur inattendue lors de la suppression.');
        }
      },
    });
  }

  play(track: Track): void {
    // Annuler tout téléchargement audio précédent en cours
    this.playSubscription?.unsubscribe();

    this.audioError.set('');
    this.audioLoading.set(true);

    this.playSubscription = this.service.audio(track.id).subscribe({
      next: (blob) => {
        this.audioLoading.set(false);
        console.debug('[TracksPage] Audio chargé', track.id);

        // Révocation de l'ancienne URL ObjectURL pour libérer la mémoire du navigateur
        const previousUrl = this.audioUrl();
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        this.audioUrl.set(URL.createObjectURL(blob));
        this.currentTrack.set(track);
      },
      error: (err: unknown) => {
        this.audioLoading.set(false);
        console.error('[TracksPage] Lecture impossible', err);
        if (err instanceof HttpErrorResponse) {
          this.audioError.set(err.error?.message ?? 'Impossible de récupérer la piste audio.');
        } else {
          this.audioError.set('Erreur inattendue lors de la lecture audio.');
        }
      },
    });
  }

  formatSize(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || isNaN(Number(bytes)) || Number(bytes) < 0) {
      return 'Taille inconnue';
    }
    const num = Number(bytes);
    if (num === 0) return '0 Ko';
    if (num >= 1024 * 1024) {
      return (num / (1024 * 1024)).toFixed(2) + ' Mo';
    }
    if (num >= 1024) {
      return Math.round(num / 1024) + ' Ko';
    }
    return num + ' o';
  }

  formatMime(mime: string | null | undefined): string {
    if (!mime || typeof mime !== 'string') return 'AUDIO';
    const lower = mime.toLowerCase();
    if (lower.includes('mpeg') || lower.includes('mp3')) return 'MP3';
    if (lower.includes('wav')) return 'WAV';
    if (lower.includes('ogg')) return 'OGG';
    if (lower.includes('mp4') || lower.includes('m4a')) return 'M4A';
    return lower.replace('audio/', '').toUpperCase() || 'AUDIO';
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr || typeof dateStr !== 'string') return 'Date inconnue';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return 'Date invalide';
      }
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return 'Date invalide';
    }
  }
}

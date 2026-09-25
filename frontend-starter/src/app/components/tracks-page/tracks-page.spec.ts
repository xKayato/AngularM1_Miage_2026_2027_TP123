import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { of, throwError, Subject } from 'rxjs';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { getFrenchPaginatorIntl, TracksPageComponent } from './tracks-page';
import { TrackService } from '../../shared/services/track.service';
import { Page } from '../../shared/models/page.model';
import { Track } from '../../shared/models/track.model';

describe('TracksPageComponent (Mission 2 — Pagination)', () => {
  let component: TracksPageComponent;
  let fixture: ComponentFixture<TracksPageComponent>;
  let mockTrackService: {
    list: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    audio: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    cover: ReturnType<typeof vi.fn>;
    updateCover: ReturnType<typeof vi.fn>;
    deleteCover: ReturnType<typeof vi.fn>;
  };

  const mockTrack1: Track = {
    id: 'track-1',
    title: 'Rock Backing in D',
    originalName: 'rock_d.mp3',
    mimeType: 'audio/mpeg',
    size: 2500000,
    createdAt: '2026-09-01T10:00:00.000Z',
  };

  const mockTrack2: Track = {
    id: 'track-2',
    title: 'Jazz Ballad in C',
    originalName: 'jazz_c.mp3',
    mimeType: 'audio/mpeg',
    size: 3100000,
    createdAt: '2026-09-02T10:00:00.000Z',
  };

  const mockPage1: Page<Track> = {
    items: [mockTrack1, mockTrack2],
    page: 1,
    limit: 5,
    total: 7,
    pages: 2,
  };

  const mockPage2: Page<Track> = {
    items: [{ ...mockTrack1, id: 'track-3', title: 'Funk Groove in E' }],
    page: 2,
    limit: 5,
    total: 7,
    pages: 2,
  };

  beforeEach(async () => {
    mockTrackService = {
      list: vi.fn().mockReturnValue(of(mockPage1)),
      upload: vi.fn(),
      audio: vi.fn(),
      delete: vi.fn().mockReturnValue(of(undefined)),
      cover: vi.fn().mockReturnValue(of(new Blob(['cover content'], { type: 'image/png' }))),
      updateCover: vi.fn().mockReturnValue(of(mockTrack1)),
      deleteCover: vi.fn().mockReturnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [{ provide: TrackService, useValue: mockTrackService }],
    }).compileComponents();

    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize and load the first page with limit=5', () => {
    fixture.detectChanges(); // triggers ngOnInit -> load()

    expect(mockTrackService.list).toHaveBeenCalledWith(1, 5);
    expect(component.tracks().length).toBe(2);
    expect(component.page()).toBe(1);
    expect(component.pages()).toBe(2);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('');
  });

  it('should display empty message when no tracks exist', () => {
    mockTrackService.list.mockReturnValue(
      of({ items: [], page: 1, limit: 5, total: 0, pages: 1 }),
    );

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Aucune piste dans la bibliothèque.');
    expect(component.tracks().length).toBe(0);
  });

  it('should navigate to next page and trigger a new server request', () => {
    fixture.detectChanges();

    mockTrackService.list.mockReturnValue(of(mockPage2));
    component.go(2);
    fixture.detectChanges();

    expect(mockTrackService.list).toHaveBeenCalledWith(2, 5);
    expect(component.page()).toBe(2);
    expect(component.tracks()[0].title).toBe('Funk Groove in E');
  });

  it('should not navigate beyond bounds (page < 1 or page > pages)', () => {
    fixture.detectChanges();
    mockTrackService.list.mockClear();

    // Already on page 1, trying to go to page 0
    component.go(0);
    expect(mockTrackService.list).not.toHaveBeenCalled();

    // Pages total is 2, trying to go to page 3
    component.go(3);
    expect(mockTrackService.list).not.toHaveBeenCalled();
  });

  it('should disable previous navigation on first page and next navigation on last page', () => {
    fixture.detectChanges();

    const prevButton = fixture.nativeElement.querySelector(
      '.mat-mdc-paginator-navigation-previous',
    ) as HTMLButtonElement;
    const nextButton = fixture.nativeElement.querySelector(
      '.mat-mdc-paginator-navigation-next',
    ) as HTMLButtonElement;

    // Page 1 of 2: Prev disabled, Next enabled (Material MDC utilise aria-disabled avec disabledInteractive)
    expect(prevButton.getAttribute('aria-disabled')).toBe('true');
    expect(nextButton.getAttribute('aria-disabled')).not.toBe('true');

    // Navigate to page 2 (last page)
    mockTrackService.list.mockReturnValue(of(mockPage2));
    component.onPageChange({ pageIndex: 1, pageSize: 5, length: 7, previousPageIndex: 0 });
    fixture.detectChanges();

    expect(prevButton.getAttribute('aria-disabled')).not.toBe('true');
    expect(nextButton.getAttribute('aria-disabled')).toBe('true');
  });

  it('should disable paginator navigation while loading', () => {
    fixture.detectChanges();
    component.loading.set(true);
    fixture.detectChanges();

    const prevButton = fixture.nativeElement.querySelector(
      '.mat-mdc-paginator-navigation-previous',
    ) as HTMLButtonElement;
    const nextButton = fixture.nativeElement.querySelector(
      '.mat-mdc-paginator-navigation-next',
    ) as HTMLButtonElement;
    expect(prevButton.getAttribute('aria-disabled')).toBe('true');
    expect(nextButton.getAttribute('aria-disabled')).toBe('true');
  });

  it('should display error message when loading tracks fails', () => {
    const error500 = new HttpErrorResponse({
      status: 500,
      statusText: 'Internal Server Error',
      error: { message: 'Erreur de base de données' },
    });
    mockTrackService.list.mockReturnValue(throwError(() => error500));

    fixture.detectChanges(); // calls load()

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Erreur de base de données');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.error')?.textContent).toContain('Erreur de base de données');
  });

  it('should handle rapid page changes without race condition (anti-collision)', () => {
    // Simulate delayed response for page 1
    const page1Subject = new Subject<Page<Track>>();
    const page2Subject = new Subject<Page<Track>>();

    mockTrackService.list.mockReturnValueOnce(page1Subject.asObservable());

    component.ngOnInit(); // triggers load(1)
    expect(component.page()).toBe(1);

    // Suppose page 1 header/metadata indicated 2 pages, or user clicks next
    component.pages.set(2);

    // Fast click to page 2 before page 1 responds
    mockTrackService.list.mockReturnValueOnce(page2Subject.asObservable());
    component.go(2);
    expect(component.page()).toBe(2);

    // Page 2 responds first
    page2Subject.next(mockPage2);
    expect(component.tracks()[0].title).toBe('Funk Groove in E');

    // Page 1 responds late (should be ignored because loadSubscription was cancelled)
    page1Subject.next(mockPage1);
    expect(component.tracks()[0].title).toBe('Funk Groove in E');
    expect(component.page()).toBe(2);
  });

  describe('Mission 3B — Upload audio et validations', () => {
    it('should reject upload when no file is selected (fichier absent)', () => {
      component.file = undefined;
      component.upload();

      expect(component.uploadError()).toContain('Veuillez sélectionner un fichier audio');
      expect(mockTrackService.upload).not.toHaveBeenCalled();
    });

    it('should reject upload when file format is not accepted (type refusé)', () => {
      component.file = new File(['image content'], 'cover.png', { type: 'image/png' });
      component.upload();

      expect(component.uploadError()).toContain('Format audio non accepté');
      expect(mockTrackService.upload).not.toHaveBeenCalled();
    });

    it('should reject upload when file size exceeds 25 MB (taille supérieure à 25 Mo)', () => {
      const hugeFile = new File(['dummy'], 'huge.mp3', { type: 'audio/mpeg' });
      Object.defineProperty(hugeFile, 'size', { value: 26 * 1024 * 1024 });

      component.file = hugeFile;
      component.upload();

      expect(component.uploadError()).toContain('25 Mo');
      expect(mockTrackService.upload).not.toHaveBeenCalled();
    });

    it('should reject upload when title contains only spaces', () => {
      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.title.setValue('    ');
      component.upload();

      expect(component.uploadError()).toContain("Le titre ne peut pas être composé uniquement d'espaces");
      expect(mockTrackService.upload).not.toHaveBeenCalled();
    });

    it('should prevent double submission when upload is already running', () => {
      const uploadSubject = new Subject<HttpEvent<Track>>();
      mockTrackService.upload.mockReturnValue(uploadSubject.asObservable());

      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.title.setValue('My Track');

      component.upload();
      expect(component.uploading()).toBe(true);
      expect(mockTrackService.upload).toHaveBeenCalledTimes(1);

      // Second click while in-flight
      component.upload();
      expect(mockTrackService.upload).toHaveBeenCalledTimes(1);
    });

    it('should handle successful upload by resetting form, reloading page 1 and displaying success message', () => {
      const newTrack: Track = {
        id: 'track-new',
        title: 'Fresh Track',
        originalName: 'track.mp3',
        mimeType: 'audio/mpeg',
        size: 1500000,
        createdAt: '2026-09-24T10:00:00.000Z',
      };
      mockTrackService.upload.mockReturnValue(of(new HttpResponse<Track>({ status: 201, body: newTrack })));

      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.title.setValue('Fresh Track');
      component.page.set(2);

      component.upload();

      expect(component.uploading()).toBe(false);
      expect(component.uploadSuccess()).toContain('Fresh Track');
      expect(component.uploadError()).toBe('');
      expect(component.title.value).toBe('');
      expect(component.file).toBeUndefined();
      expect(component.page()).toBe(1);
      expect(mockTrackService.list).toHaveBeenCalledWith(1, 5);
    });

    it('should handle upload HTTP error, display error message and preserve existing tracks', () => {
      fixture.detectChanges(); // Charge la page 1 avec 2 pistes
      expect(component.tracks().length).toBe(2);

      const serverError = new HttpErrorResponse({
        status: 400,
        statusText: 'Bad Request',
        error: { message: 'Format audio corrompu' },
      });
      mockTrackService.upload.mockReturnValue(throwError(() => serverError));

      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.upload();

      expect(component.uploading()).toBe(false);
      expect(component.uploadError()).toBe('Format audio corrompu');
      // Les pistes déjà affichées doivent rester préservées
      expect(component.tracks().length).toBe(2);
      expect(component.tracks()[0].title).toBe('Rock Backing in D');
    });
  });

  describe('Mission 3C — Lecture audio, ObjectURL et cards', () => {
    it('should play a track, load Blob via HttpClient, generate ObjectURL and display player with current track', () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost:4200/mock-uuid-1');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const mockBlob = new Blob(['mock audio binary'], { type: 'audio/mpeg' });
      mockTrackService.audio.mockReturnValue(of(mockBlob));

      fixture.detectChanges();
      component.play(mockTrack1);

      expect(mockTrackService.audio).toHaveBeenCalledWith('track-1');
      expect(component.currentTrack()).toEqual(mockTrack1);
      expect(component.audioUrl()).toBe('blob:http://localhost:4200/mock-uuid-1');
      expect(component.audioError()).toBe('');
      expect(component.audioLoading()).toBe(false);

      fixture.detectChanges();
      const audioElement = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
      expect(audioElement).not.toBeNull();
      // Vérifie que l'URL src est bien une URL mémoire locale (blob:), et JAMAIS directement l'URL d'API protégée
      expect(audioElement.src).toContain('blob:');
      expect(audioElement.src).not.toContain('/api/tracks/track-1/audio');

      const playerPanel = fixture.nativeElement.querySelector('.player-panel') as HTMLElement;
      expect(playerPanel.textContent).toContain('Rock Backing in D');
    });

    it('should display understandable error message when audio download fails', () => {
      const audioHttpError = new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        error: { message: 'Piste audio introuvable' },
      });
      mockTrackService.audio.mockReturnValue(throwError(() => audioHttpError));

      component.play(mockTrack1);

      expect(component.audioLoading()).toBe(false);
      expect(component.audioError()).toBe('Piste audio introuvable');
      expect(component.audioUrl()).toBe('');
    });

    it('should revoke previous ObjectURL when switching tracks', () => {
      let counter = 1;
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:http://localhost:4200/track-${counter++}`);
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      mockTrackService.audio.mockReturnValue(of(new Blob(['audio 1'])));

      component.play(mockTrack1);
      expect(component.audioUrl()).toBe('blob:http://localhost:4200/track-1');
      expect(revokeSpy).not.toHaveBeenCalled();

      // Clic sur un second morceau
      component.play(mockTrack2);
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/track-1');
      expect(component.audioUrl()).toBe('blob:http://localhost:4200/track-2');
      expect(component.currentTrack()).toEqual(mockTrack2);
    });

    it('should revoke final ObjectURL and clean up on component destroy (ngOnDestroy)', () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost:4200/final-track');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      mockTrackService.audio.mockReturnValue(of(new Blob(['audio binary'])));
      component.play(mockTrack1);
      expect(component.audioUrl()).toBe('blob:http://localhost:4200/final-track');

      fixture.destroy();
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/final-track');
    });

    it('should format track metadata correctly for responsive cards', () => {
      expect(component.formatSize(2500000)).toBe('2.38 Mo');
      expect(component.formatSize(51200)).toBe('50 Ko');
      expect(component.formatSize(0)).toBe('0 Ko');

      expect(component.formatMime('audio/mpeg')).toBe('MP3');
      expect(component.formatMime('audio/wav')).toBe('WAV');
      expect(component.formatMime('audio/ogg')).toBe('OGG');
      expect(component.formatMime('audio/mp4')).toBe('M4A');

      expect(component.formatDate('2026-09-01T10:00:00.000Z')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('Option avancée — MatPaginator', () => {
    it('should convert 0-indexed pageIndex to 1-indexed API page on page change and send correct HTTP params', () => {
      fixture.detectChanges();
      mockTrackService.list.mockClear();

      mockTrackService.list.mockReturnValue(of(mockPage2));
      // Material pageIndex = 1 (meaning page 2 in human/API terms)
      component.onPageChange({ pageIndex: 1, pageSize: 5, length: 7, previousPageIndex: 0 });

      expect(component.page()).toBe(2);
      expect(mockTrackService.list).toHaveBeenCalledWith(2, 5);
    });

    it('should reset to page 1 and send new pageSize when pageSize changes', () => {
      fixture.detectChanges();
      mockTrackService.list.mockClear();

      // Current state: page 2, limit 5
      component.page.set(2);
      component.limit.set(5);

      const largePage: Page<Track> = {
        items: [mockTrack1, mockTrack2],
        page: 1,
        limit: 10,
        total: 7,
        pages: 1,
      };
      mockTrackService.list.mockReturnValue(of(largePage));

      // User changes pageSize to 10
      component.onPageChange({ pageIndex: 0, pageSize: 10, length: 7, previousPageIndex: 1 });

      expect(component.limit()).toBe(10);
      expect(component.page()).toBe(1);
      expect(mockTrackService.list).toHaveBeenCalledWith(1, 10);
    });

    it('should configure French internationalization for MatPaginator', () => {
      const intl = getFrenchPaginatorIntl();

      expect(intl.itemsPerPageLabel).toBe('Pistes par page :');
      expect(intl.nextPageLabel).toBe('Page suivante');
      expect(intl.previousPageLabel).toBe('Page précédente');
      expect(intl.firstPageLabel).toBe('Première page');
      expect(intl.lastPageLabel).toBe('Dernière page');

      // Test getRangeLabel calculations
      expect(intl.getRangeLabel(0, 5, 0)).toBe('0 sur 0');
      expect(intl.getRangeLabel(0, 5, 7)).toBe('1 – 5 sur 7');
      expect(intl.getRangeLabel(1, 5, 7)).toBe('6 – 7 sur 7');
    });

    it('should render mat-paginator with accessibility aria-label', () => {
      fixture.detectChanges();

      const paginatorEl = fixture.nativeElement.querySelector('mat-paginator');
      expect(paginatorEl).not.toBeNull();
      expect(paginatorEl.getAttribute('aria-label')).toBe('Sélectionner la page de la bibliothèque');
    });
  });

  describe("Option avancée — Barre de progression d'upload", () => {
    it('should track upload progress percentage when total is known and distinguish 100% from server response', () => {
      const uploadSubject = new Subject<HttpEvent<Track>>();
      mockTrackService.upload.mockReturnValue(uploadSubject.asObservable());

      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.title.setValue('Groovy Track');
      component.upload();

      expect(component.uploading()).toBe(true);
      expect(component.uploadStatusText()).toBe("Initialisation de l'envoi…");

      // Événement de progression : 40% des octets envoyés
      uploadSubject.next({
        type: HttpEventType.UploadProgress,
        loaded: 400,
        total: 1000,
      });
      expect(component.uploadProgress()).toBe(40);
      expect(component.uploadStatusText()).toBe('Envoi en cours : 40 %');
      expect(component.uploadSuccess()).toBe('');
      expect(component.uploading()).toBe(true);

      // Événement de progression : 100% des octets envoyés sur le réseau
      // MAIS le serveur traite encore le fichier (Multer, disque, MongoDB)
      uploadSubject.next({
        type: HttpEventType.UploadProgress,
        loaded: 1000,
        total: 1000,
      });
      expect(component.uploadProgress()).toBe(100);
      expect(component.uploadStatusText()).toBe('Envoi terminé. Traitement par le serveur en cours…');
      // La réussite ne doit PAS encore être déclarée tant que le serveur n'a pas répondu
      expect(component.uploadSuccess()).toBe('');
      expect(component.uploading()).toBe(true);

      // Le serveur répond avec succès (HTTP 201 Response)
      const createdTrack: Track = {
        id: 'track-groovy',
        title: 'Groovy Track',
        originalName: 'track.mp3',
        mimeType: 'audio/mpeg',
        size: 1000,
        createdAt: '2026-09-24T10:00:00.000Z',
      };
      uploadSubject.next(new HttpResponse<Track>({ status: 201, body: createdTrack }));
      uploadSubject.complete();

      expect(component.uploading()).toBe(false);
      expect(component.uploadProgress()).toBeNull();
      expect(component.uploadStatusText()).toBe('');
      expect(component.uploadSuccess()).toContain('Groovy Track');
      expect(mockTrackService.list).toHaveBeenCalledWith(1, 5);
    });

    it('should display indeterminate state when total size is not available', () => {
      const uploadSubject = new Subject<HttpEvent<Track>>();
      mockTrackService.upload.mockReturnValue(uploadSubject.asObservable());

      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.upload();

      uploadSubject.next({
        type: HttpEventType.UploadProgress,
        loaded: 2048,
        total: undefined,
      });

      expect(component.uploadProgress()).toBeNull();
      expect(component.uploadStatusText()).toContain('taille totale indéterminée');
      expect(component.uploading()).toBe(true);
    });

    it('should reset progress and display error message when upload fails with HTTP error', () => {
      const uploadSubject = new Subject<HttpEvent<Track>>();
      mockTrackService.upload.mockReturnValue(uploadSubject.asObservable());

      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.upload();

      uploadSubject.next({
        type: HttpEventType.UploadProgress,
        loaded: 300,
        total: 1000,
      });
      expect(component.uploadProgress()).toBe(30);

      uploadSubject.error(
        new HttpErrorResponse({
          status: 500,
          statusText: 'Internal Server Error',
          error: { message: 'Erreur disque serveur' },
        }),
      );

      expect(component.uploading()).toBe(false);
      expect(component.uploadProgress()).toBeNull();
      expect(component.uploadStatusText()).toBe('');
      expect(component.uploadError()).toBe('Erreur disque serveur');
    });

    it('should render progress bar element and accessibility attributes in template', () => {
      component.file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
      component.uploading.set(true);
      component.uploadProgress.set(65);
      component.uploadStatusText.set('Envoi en cours : 65 %');

      fixture.detectChanges();

      const progressBar = fixture.nativeElement.querySelector('.progress-bar-fill') as HTMLElement;
      expect(progressBar).not.toBeNull();
      expect(progressBar.getAttribute('role')).toBe('progressbar');
      expect(progressBar.getAttribute('aria-valuenow')).toBe('65');
      expect(progressBar.style.width).toBe('65%');

      const statusEl = fixture.nativeElement.querySelector('.progress-status') as HTMLElement;
      expect(statusEl.textContent).toContain('Envoi en cours : 65 %');
    });
  });

  describe('Option avancée — Suppression de piste (DELETE /api/tracks/:id)', () => {
    it('should cancel deletion when user refuses confirmation (annulation)', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.deleteTrack(mockTrack1);

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockTrackService.delete).not.toHaveBeenCalled();
      expect(component.deletingTrackId()).toBeNull();
    });

    it('should delete track with pessimistic strategy, show success message and reload current page (succès)', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      fixture.detectChanges(); // charge mockPage1 avec 2 pistes
      expect(component.tracks().length).toBe(2);

      mockTrackService.delete.mockReturnValue(of(undefined));
      component.deleteTrack(mockTrack1);

      expect(mockTrackService.delete).toHaveBeenCalledWith('track-1');
      expect(component.deleteSuccess()).toContain('Rock Backing in D');
      expect(component.deleteError()).toBe('');
      expect(component.deletingTrackId()).toBeNull();
      // Rechargement depuis le serveur de la page 1
      expect(mockTrackService.list).toHaveBeenCalledWith(1, 5);
    });

    it('should prevent concurrent or double click deletion during in-flight request (double clic)', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const deleteSubject = new Subject<void>();
      mockTrackService.delete.mockReturnValue(deleteSubject.asObservable());

      component.deleteTrack(mockTrack1);

      expect(component.deletingTrackId()).toBe('track-1');
      expect(mockTrackService.delete).toHaveBeenCalledTimes(1);

      // Deuxième tentative pendant que la suppression est en cours
      component.deleteTrack(mockTrack1);
      component.deleteTrack(mockTrack2);
      expect(mockTrackService.delete).toHaveBeenCalledTimes(1);
    });

    it('should display error and preserve tracks on access refusal (404 Piste inconnue / autre utilisateur)', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      fixture.detectChanges();

      const error404 = new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        error: { message: 'Piste inconnue' },
      });
      mockTrackService.delete.mockReturnValue(throwError(() => error404));

      component.deleteTrack(mockTrack1);

      expect(component.deleteError()).toBe('Piste inconnue');
      expect(component.tracks().length).toBe(2);
      expect(component.tracks()[0].id).toBe('track-1');
      expect(component.deletingTrackId()).toBeNull();
    });

    it('should display error and preserve tracks on disk deletion failure (HTTP 500)', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      fixture.detectChanges();

      const error500 = new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
        error: { message: 'Métadonnée supprimée, mais fichier audio non supprimé' },
      });
      mockTrackService.delete.mockReturnValue(throwError(() => error500));

      component.deleteTrack(mockTrack1);

      expect(component.deleteError()).toBe('Métadonnée supprimée, mais fichier audio non supprimé');
      expect(component.tracks().length).toBe(2);
      expect(component.deletingTrackId()).toBeNull();
    });

    it('should navigate to previous page when deleting the last track of a page (dernière page devenue vide)', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockTrackService.delete.mockReturnValue(of(undefined));

      // Utilisateur sur page 2 avec un seul élément
      component.page.set(2);
      component.tracks.set([mockTrack2]);

      component.deleteTrack(mockTrack2);

      // Rebascule sur page 1
      expect(component.page()).toBe(1);
      expect(mockTrackService.list).toHaveBeenCalledWith(1, 5);
    });

    it('should stop playback and revoke ObjectURL if deleted track was currently playing', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      component.currentTrack.set(mockTrack1);
      component.audioUrl.set('blob:http://localhost:4200/playing-track');
      mockTrackService.delete.mockReturnValue(of(undefined));

      component.deleteTrack(mockTrack1);

      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/playing-track');
      expect(component.currentTrack()).toBeNull();
      expect(component.audioUrl()).toBe('');
    });

    it('should render accessible delete button on each track card in template', () => {
      fixture.detectChanges();

      const deleteBtn = fixture.nativeElement.querySelector('.delete-btn') as HTMLButtonElement;
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn.getAttribute('aria-label')).toBe('Supprimer la piste Rock Backing in D');
      expect(deleteBtn.textContent).toContain('Supprimer');
    });
  });

  describe('Amélioration — Affichage et accessibilité des métadonnées des cards', () => {
    it('should safely format file size and handle missing, negative, or invalid values', () => {
      expect(component.formatSize(null)).toBe('Taille inconnue');
      expect(component.formatSize(undefined)).toBe('Taille inconnue');
      expect(component.formatSize(-10)).toBe('Taille inconnue');
      expect(component.formatSize(NaN)).toBe('Taille inconnue');
      expect(component.formatSize(0)).toBe('0 Ko');
      expect(component.formatSize(512)).toBe('512 o');
      expect(component.formatSize(2048)).toBe('2 Ko');
      expect(component.formatSize(5242880)).toBe('5.00 Mo');
    });

    it('should safely format date in French and handle missing or invalid dates', () => {
      expect(component.formatDate('')).toBe('Date inconnue');
      expect(component.formatDate(null)).toBe('Date inconnue');
      expect(component.formatDate(undefined)).toBe('Date inconnue');
      expect(component.formatDate('invalid-date-string')).toBe('Date invalide');
      expect(component.formatDate('2026-12-25T14:30:00.000Z')).toBe('25/12/2026');
    });

    it('should safely format audio MIME types and handle missing or unknown formats', () => {
      expect(component.formatMime('')).toBe('AUDIO');
      expect(component.formatMime(null)).toBe('AUDIO');
      expect(component.formatMime(undefined)).toBe('AUDIO');
      expect(component.formatMime('audio/flac')).toBe('FLAC');
      expect(component.formatMime('audio/wav')).toBe('WAV');
      expect(component.formatMime('audio/mpeg')).toBe('MP3');
      expect(component.formatMime('audio/ogg')).toBe('OGG');
      expect(component.formatMime('audio/mp4')).toBe('M4A');
    });

    it('should render accessible aria-labels and semantic time element in DOM', () => {
      fixture.detectChanges();

      const metaContainer = fixture.nativeElement.querySelector('.track-meta') as HTMLElement;
      expect(metaContainer).not.toBeNull();
      expect(metaContainer.getAttribute('aria-label')).toBe('Informations sur la piste');

      const metaItems = fixture.nativeElement.querySelectorAll('.meta-item') as NodeListOf<HTMLElement>;
      expect(metaItems.length).toBeGreaterThanOrEqual(4);

      // Fichier d'origine
      expect(metaItems[0].getAttribute('aria-label')).toBe("Fichier d'origine : rock_d.mp3");
      // Format
      expect(metaItems[1].getAttribute('aria-label')).toBe('Format audio : MP3');
      // Taille
      expect(metaItems[2].getAttribute('aria-label')).toBe('Taille : 2.38 Mo');
      // Date avec balise <time>
      expect(metaItems[3].getAttribute('aria-label')).toBe('Ajoutée le : 01/09/2026');

      const timeEl = fixture.nativeElement.querySelector('time') as HTMLTimeElement;
      expect(timeEl).not.toBeNull();
      expect(timeEl.getAttribute('datetime')).toBe('2026-09-01T10:00:00.000Z');
      expect(timeEl.textContent?.trim()).toBe('01/09/2026');
    });

    it('should display fallback text when originalName is missing', () => {
      const trackWithoutName: Track = {
        ...mockTrack1,
        id: 'track-no-name',
        originalName: '',
      };
      mockTrackService.list.mockReturnValue(
        of({ items: [trackWithoutName], page: 1, limit: 5, total: 1, pages: 1 }),
      );
      component.load();
      fixture.detectChanges();

      const firstMeta = fixture.nativeElement.querySelector('.meta-item') as HTMLElement;
      expect(firstMeta.textContent).toContain('Nom de fichier inconnu');
      expect(firstMeta.getAttribute('aria-label')).toBe("Fichier d'origine : Inconnu");
    });
  });

  describe('Amélioration — Filtre par titre compatible avec la pagination serveur', () => {
    it('should debounce search input and trigger search with title filter', () => {
      component.ngOnInit();
      mockTrackService.list.mockClear();

      vi.useFakeTimers();
      try {
        component.searchControl.setValue('blues');
        // Avant l'écoulement du debounce (300 ms), pas de nouvel appel HTTP
        vi.advanceTimersByTime(200);
        expect(mockTrackService.list).toHaveBeenCalledTimes(0);

        // Après 300 ms, l'appel HTTP part avec title='blues'
        vi.advanceTimersByTime(100);
        expect(mockTrackService.list).toHaveBeenCalledTimes(1);
        expect(mockTrackService.list).toHaveBeenCalledWith(1, 5, 'blues');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reset to page 1 when search filter changes', () => {
      component.ngOnInit();
      mockTrackService.list.mockClear();

      vi.useFakeTimers();
      try {
        component.page.set(3);
        component.searchControl.setValue('rock');

        vi.advanceTimersByTime(300);

        expect(component.page()).toBe(1);
        expect(mockTrackService.list).toHaveBeenCalledWith(1, 5, 'rock');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should retain active search filter when navigating pages via MatPaginator', () => {
      component.searchControl.setValue('jazz');
      expect(component.searchControl.value).toBe('jazz');

      // Changement de page via le paginator
      component.onPageChange({
        pageIndex: 1, // page 2
        previousPageIndex: 0,
        pageSize: 5,
        length: 10,
      });

      expect(component.page()).toBe(2);
      expect(mockTrackService.list).toHaveBeenCalledWith(2, 5, 'jazz');
    });

    it('should handle empty search results and display customized empty message in template', () => {
      mockTrackService.list.mockReturnValue(
        of({ items: [], page: 1, limit: 5, total: 0, pages: 1 }),
      );

      component.searchControl.setValue('introuvable');
      component.searchQuery.set('introuvable');
      component.load();
      fixture.detectChanges();

      const emptyEl = fixture.nativeElement.querySelector('.empty-state') as HTMLElement;
      expect(emptyEl).not.toBeNull();
      expect(emptyEl.textContent).toContain('Aucune piste ne correspond à votre recherche « introuvable »');
    });

    it('should cancel and ignore in-flight stale responses when new search or page occurs (requêtes concurrentes)', () => {
      const subject1 = new Subject<Page<Track>>();
      const subject2 = new Subject<Page<Track>>();

      // Première requête en vol
      mockTrackService.list.mockReturnValue(subject1.asObservable());
      component.searchControl.setValue('first');
      component.load();

      // Deuxième requête déclenchée
      mockTrackService.list.mockReturnValue(subject2.asObservable());
      component.searchControl.setValue('second');
      component.load();

      // Réponse tardive de la première requête : doit être ignorée
      subject1.next(mockPage1);
      expect(component.tracks()).toEqual([]);

      // Réponse de la deuxième requête : appliquée
      const finalPage: Page<Track> = { ...mockPage1, items: [mockTrack2] };
      subject2.next(finalPage);
      expect(component.tracks()).toEqual([mockTrack2]);
    });

    it('should render accessible search input and allow clearing filter with clear button', () => {
      fixture.detectChanges();

      const searchInput = fixture.nativeElement.querySelector('#search-input') as HTMLInputElement;
      expect(searchInput).not.toBeNull();
      expect(searchInput.getAttribute('type')).toBe('search');
      expect(searchInput.getAttribute('aria-label')).toBe('Filtrer les pistes par titre');

      // Pas de bouton effacer quand le champ est vide
      expect(fixture.nativeElement.querySelector('.clear-search-btn')).toBeNull();

      // Saisie d'une recherche
      component.searchControl.setValue('funk');
      fixture.detectChanges();

      const clearBtn = fixture.nativeElement.querySelector('.clear-search-btn') as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();
      expect(clearBtn.getAttribute('aria-label')).toBe('Effacer le filtre de recherche');

      // Clic sur effacer
      clearBtn.click();
      expect(component.searchControl.value).toBe('');
      expect(component.searchQuery()).toBe('');
    });
  });

  describe('Option avancée — Image de couverture par piste', () => {
    it('should validate selected cover file format and reject unsupported types', () => {
      const invalidEvent = {
        target: {
          files: [new File(['text'], 'notes.txt', { type: 'text/plain' })],
          value: 'notes.txt',
        },
      } as unknown as Event;

      component.chooseCover(invalidEvent);

      expect(component.uploadError()).toContain("Format d'image non accepté");
      expect(component.coverFile).toBeUndefined();
      expect(component.coverPreviewUrl()).toBeNull();
    });

    it('should validate selected cover file size and reject files larger than 2 Mo', () => {
      const hugeCover = new File(['x'.repeat(100)], 'huge.png', { type: 'image/png' });
      Object.defineProperty(hugeCover, 'size', { value: 3 * 1024 * 1024 });

      const event = {
        target: {
          files: [hugeCover],
          value: 'huge.png',
        },
      } as unknown as Event;

      component.chooseCover(event);

      expect(component.uploadError()).toContain('2 Mo');
      expect(component.coverFile).toBeUndefined();
      expect(component.coverPreviewUrl()).toBeNull();
    });

    it('should accept valid cover image and generate preview ObjectURL', () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost:4200/preview-123');

      const validCover = new File(['valid image bytes'], 'artwork.png', { type: 'image/png' });
      const event = {
        target: {
          files: [validCover],
          value: 'artwork.png',
        },
      } as unknown as Event;

      component.chooseCover(event);

      expect(component.uploadError()).toBe('');
      expect(component.coverFile).toBe(validCover);
      expect(component.coverPreviewUrl()).toBe('blob:http://localhost:4200/preview-123');
    });

    it('should clear selected cover and revoke preview URL when clearCover() is called', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      component.coverFile = new File(['img'], 'cover.png', { type: 'image/png' });
      component.coverPreviewUrl.set('blob:http://localhost:4200/preview-cover');

      component.clearCover();

      expect(component.coverFile).toBeUndefined();
      expect(component.coverPreviewUrl()).toBeNull();
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/preview-cover');
    });

    it('should include coverFile when calling upload()', () => {
      const audioFile = new File(['audio content'], 'song.mp3', { type: 'audio/mpeg' });
      const coverFile = new File(['cover content'], 'art.webp', { type: 'image/webp' });

      mockTrackService.upload.mockReturnValue(of(new HttpResponse<Track>({ status: 201, body: mockTrack1 })));

      component.file = audioFile;
      component.coverFile = coverFile;
      component.title.setValue('Song with Artwork');

      component.upload();

      expect(mockTrackService.upload).toHaveBeenCalledWith(audioFile, 'Song with Artwork', coverFile);
      expect(component.coverFile).toBeUndefined();
      expect(component.coverPreviewUrl()).toBeNull();
    });

    it('should load cover blobs for tracks that have covers', () => {
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:http://localhost:4200/cover-${Date.now()}`);

      const trackWithCover: Track = {
        ...mockTrack1,
        id: 'track-with-cover',
        hasCover: true,
        coverUrl: '/api/tracks/track-with-cover/cover',
      };
      const pageWithCover: Page<Track> = {
        items: [trackWithCover],
        page: 1,
        limit: 5,
        total: 1,
        pages: 1,
      };

      mockTrackService.list.mockReturnValue(of(pageWithCover));
      mockTrackService.cover.mockReturnValue(of(new Blob(['cover img'], { type: 'image/png' })));

      component.load();

      expect(mockTrackService.cover).toHaveBeenCalledWith('track-with-cover');
      expect(component.coverUrls()['track-with-cover']).toContain('blob:');
      expect(component.getCoverUrl(trackWithCover)).toContain('blob:');
    });

    it('should return default cover fallback when track has no cover or on image error', () => {
      const trackWithoutCover: Track = { ...mockTrack1, hasCover: false };
      expect(component.getCoverUrl(trackWithoutCover)).toBe('/default-cover.svg');

      // Si une erreur de chargement survient sur une image existante dans le DOM
      const imgElement = document.createElement('img');
      imgElement.src = 'blob:broken';
      const errorEvent = { target: imgElement } as unknown as Event;
      component.onCoverImgError(errorEvent);
      expect(imgElement.src).toContain('/default-cover.svg');
    });

    it('should delete track cover after user confirmation, revoke ObjectURL and reset cover state', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const track: Track = {
        ...mockTrack1,
        id: 'track-del-cov',
        hasCover: true,
        coverUrl: '/api/tracks/track-del-cov/cover',
      };
      component.tracks.set([track]);
      component.coverUrls.set({ 'track-del-cov': 'blob:http://localhost:4200/cov-to-del' });

      mockTrackService.deleteCover.mockReturnValue(of(undefined));

      component.deleteCover(track);

      expect(mockTrackService.deleteCover).toHaveBeenCalledWith('track-del-cov');
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/cov-to-del');
      expect(component.coverUrls()['track-del-cov']).toBeUndefined();
      expect(track.hasCover).toBe(false);
      expect(track.coverUrl).toBeNull();
      expect(component.deleteSuccess()).toContain('La pochette de');
    });

    it('should update track cover via changeCover(), revoke previous ObjectURL and reload blob', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost:4200/new-cover-blob');

      const track: Track = {
        ...mockTrack1,
        id: 'track-update-cov',
        hasCover: true,
        coverUrl: '/api/tracks/track-update-cov/cover',
      };
      component.coverUrls.set({ 'track-update-cov': 'blob:http://localhost:4200/old-cover-blob' });

      const newCoverFile = new File(['new image bytes'], 'fresh.png', { type: 'image/png' });
      const event = {
        target: {
          files: [newCoverFile],
          value: 'fresh.png',
        },
      } as unknown as Event;

      mockTrackService.updateCover.mockReturnValue(of({ ...track, hasCover: true, coverUrl: '/api/tracks/track-update-cov/cover' }));
      mockTrackService.cover.mockReturnValue(of(new Blob(['fresh binary'], { type: 'image/png' })));

      component.changeCover(track, event);

      expect(mockTrackService.updateCover).toHaveBeenCalledWith('track-update-cov', newCoverFile);
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/old-cover-blob');
      expect(mockTrackService.cover).toHaveBeenCalledWith('track-update-cov');
      expect(component.deleteSuccess()).toContain('mise à jour avec succès');
    });

    it('should revoke all cover ObjectURLs when destroying component', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      component.coverUrls.set({
        'trk-1': 'blob:http://localhost:4200/cov1',
        'trk-2': 'blob:http://localhost:4200/cov2',
      });
      component.coverPreviewUrl.set('blob:http://localhost:4200/preview-destroy');

      component.ngOnDestroy();

      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/cov1');
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/cov2');
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost:4200/preview-destroy');
    });
  });
});

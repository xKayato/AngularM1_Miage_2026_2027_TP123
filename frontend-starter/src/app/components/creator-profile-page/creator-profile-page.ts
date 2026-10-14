import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CreatorService } from '../../shared/services/creator.service';
import { AuthService } from '../../shared/services/auth.service';
import { CreatorPublicProfile } from '../../shared/models/creator.model';

@Component({
  selector: 'app-creator-profile-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './creator-profile-page.html',
  styleUrls: ['./creator-profile-page.css'],
})
export class CreatorProfilePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly creatorService = inject(CreatorService);
  readonly auth = inject(AuthService);

  readonly creatorId = signal<string>('');
  readonly profile = signal<CreatorPublicProfile | null>(null);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  readonly isFollowLoading = signal<boolean>(false);
  readonly isSubscribeLoading = signal<boolean>(false);
  readonly actionMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly isSelf = computed(() => {
    const current = this.profile();
    if (!current) return false;
    const myId = this.auth.currentUser()?.id;
    return Boolean(current.isSelf || (myId && myId === current.id));
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Identifiant créateur manquant.');
      this.loading.set(false);
      return;
    }

    this.creatorId.set(id);
    this.loadProfile(id);
  }

  loadProfile(id: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.creatorService.getCreatorProfile(id).subscribe({
      next: (data) => {
        this.profile.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.error.set('Ce profil de créateur est introuvable ou a été suspendu par la modération.');
        } else {
          this.error.set(err.error?.message || 'Erreur lors du chargement du profil.');
        }
      },
    });
  }

  follow(): void {
    const prof = this.profile();
    if (!prof || this.isFollowLoading() || this.isSelf()) return;

    this.isFollowLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.follow(prof.id).subscribe({
      next: (res) => {
        this.isFollowLoading.set(false);
        this.profile.update((curr) => {
          if (!curr) return null;
          return {
            ...curr,
            followersCount: curr.followersCount + (res.following ? 1 : 0),
            userInteractions: {
              ...curr.userInteractions,
              isFollowing: res.following,
            },
          };
        });
        this.actionMessage.set(`Vous suivez désormais ${prof.name}.`);
        // Recharger le profil pour déverrouiller ses posts followers
        this.loadProfile(prof.id);
      },
      error: (err) => {
        this.isFollowLoading.set(false);
        this.actionError.set(err.error?.message || 'Erreur lors du suivi.');
      },
    });
  }

  unfollow(): void {
    const prof = this.profile();
    if (!prof || this.isFollowLoading() || this.isSelf()) return;

    this.isFollowLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.unfollow(prof.id).subscribe({
      next: (res) => {
        this.isFollowLoading.set(false);
        this.profile.update((curr) => {
          if (!curr) return null;
          return {
            ...curr,
            followersCount: Math.max(0, curr.followersCount - 1),
            userInteractions: {
              ...curr.userInteractions,
              isFollowing: res.following,
            },
          };
        });
        this.actionMessage.set(`Vous ne suivez plus ${prof.name}.`);
        this.loadProfile(prof.id);
      },
      error: (err) => {
        this.isFollowLoading.set(false);
        this.actionError.set(err.error?.message || 'Erreur lors du désabonnement.');
      },
    });
  }

  subscribe(): void {
    const prof = this.profile();
    if (!prof || this.isSubscribeLoading() || this.isSelf()) return;

    this.isSubscribeLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(null);

    this.creatorService.subscribe(prof.id).subscribe({
      next: (res) => {
        this.isSubscribeLoading.set(false);
        this.profile.update((curr) => {
          if (!curr) return null;
          return {
            ...curr,
            subscribersCount: curr.subscribersCount + 1,
            userInteractions: {
              ...curr.userInteractions,
              isSubscribed: true,
              subscriptionExpiresAt: res.expiresAt,
            },
          };
        });
        this.actionMessage.set(
          `Abonnement simulé de 30 jours activé (Simulation — aucun paiement). Échéance : ${new Date(res.expiresAt).toLocaleDateString('fr-FR')}.`
        );
        this.loadProfile(prof.id);
      },
      error: (err) => {
        this.isSubscribeLoading.set(false);
        if (err.status === 409) {
          this.actionError.set(err.error?.message || 'Abonnement déjà actif.');
        } else {
          this.actionError.set(err.error?.message || 'Erreur lors de la souscription.');
        }
      },
    });
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
}

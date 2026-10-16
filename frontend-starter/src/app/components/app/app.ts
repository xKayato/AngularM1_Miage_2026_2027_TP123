import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { ThemeService } from '../../shared/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly mobileMenuOpen = signal<boolean>(false);
  readonly avatarFailed = signal<boolean>(false);

  constructor() {
    effect(() => {
      // Dès que l'utilisateur ou son avatar change, réinitialiser l'état d'échec pour tenter l'affichage
      const user = this.auth.currentUser();
      if (user) {
        this.avatarFailed.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.auth.initializeSession();
  }

  logout(): void {
    this.auth.logout();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.set(!this.mobileMenuOpen());
  }

  onAvatarError(): void {
    this.avatarFailed.set(true);
  }

  getInitials(name?: string | null): string {
    if (!name || !name.trim()) return 'MS';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}

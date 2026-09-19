import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly submitting = signal(false);

  readonly form = new FormGroup({
    email: new FormControl('demo@example.com', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('Demo1234!', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set('');

    const values = this.form.getRawValue();
    this.auth.login(values.email, values.password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl('/tracks');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (err instanceof HttpErrorResponse) {
          if (err.status === 401) {
            this.error.set('Identifiants incorrects (email ou mot de passe invalide)');
          } else if (err.status === 0) {
            this.error.set('Impossible de joindre le serveur. Vérifiez que le backend est démarré.');
          } else {
            this.error.set(err.error?.message ?? 'Erreur lors de la connexion');
          }
        } else {
          this.error.set('Une erreur inattendue est survenue');
        }
      },
    });
  }
}

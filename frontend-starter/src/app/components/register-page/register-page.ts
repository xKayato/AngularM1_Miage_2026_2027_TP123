import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly submitting = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
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
    this.auth.register(values.name, values.email, values.password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl('/tracks');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (err instanceof HttpErrorResponse) {
          if (err.status === 409) {
            this.error.set('Cette adresse email est déjà utilisée par un autre compte.');
          } else if (err.status === 400) {
            this.error.set(
              err.error?.message ??
                'Données invalides. Le mot de passe doit comporter au moins 8 caractères.',
            );
          } else if (err.status === 0) {
            this.error.set('Impossible de contacter le serveur.');
          } else {
            this.error.set(err.error?.message ?? "Erreur lors de l'inscription");
          }
        } else {
          this.error.set('Une erreur inattendue est survenue');
        }
      },
    });
  }
}

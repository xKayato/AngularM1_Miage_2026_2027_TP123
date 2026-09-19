import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly success = signal('');
  readonly error = signal('');

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  /** Checks if the form has unchanged content compared to currentUser */
  isUnchanged(): boolean {
    const currentName = this.auth.currentUser()?.name?.trim() ?? '';
    const formName = this.form.controls.name.value.trim();
    return currentName === formName;
  }

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.form.setValue({ name: user.name });
    } else {
      this.load();
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.auth.profile().subscribe({
      next: (user) => {
        this.loading.set(false);
        this.form.setValue({ name: user.name });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse) {
          this.error.set(err.error?.message ?? 'Impossible de charger le profil');
        } else {
          this.error.set('Erreur lors du chargement du profil');
        }
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.submitting() || this.isUnchanged()) {
      return;
    }

    this.submitting.set(true);
    this.success.set('');
    this.error.set('');

    const newName = this.form.controls.name.value.trim();
    this.auth.update(newName).subscribe({
      next: (updatedUser) => {
        this.submitting.set(false);
        this.form.setValue({ name: updatedUser.name });
        this.success.set('Profil mis à jour avec succès !');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (err instanceof HttpErrorResponse) {
          this.error.set(err.error?.message ?? 'Impossible de mettre à jour le profil');
        } else {
          this.error.set('Erreur lors de la mise à jour');
        }
      },
    });
  }
}

import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { routes } from './routes';
import { authGuard } from './shared/guards/auth.guard';
import { adminGuard } from './shared/guards/admin.guard';
import { PostsPageComponent } from './components/posts-page/posts-page';
import { PostDetailPageComponent } from './components/post-detail-page/post-detail-page';
import { CreatorsSearchPageComponent } from './components/creators-search-page/creators-search-page';
import { CreatorProfilePageComponent } from './components/creator-profile-page/creator-profile-page';
import { SharedPostPageComponent } from './components/shared-post-page/shared-post-page';
import { LoginPageComponent } from './components/login-page/login-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { PostsManagementPageComponent } from './components/posts-management-page/posts-management-page';
import { AdminPageComponent } from './components/admin-page/admin-page';

function route(path: string): Route {
  const found = routes.find((r) => r.path === path);
  if (!found) throw new Error(`route ${path} absente`);
  return found;
}

async function lazyComponent(path: string): Promise<Type<unknown>> {
  const r = route(path);
  expect(r.component).toBeUndefined();
  expect(typeof r.loadComponent).toBe('function');
  return (await r.loadComponent!()) as Type<unknown>;
}

describe('routes — chargement à la demande', () => {
  it('le catalogue (page d accueil) reste dans le bundle principal', () => {
    expect(route('posts').component).toBe(PostsPageComponent);
    expect(route('posts').loadComponent).toBeUndefined();
    expect(route('').redirectTo).toBe('posts');
  });

  it.each([
    ['posts/:id', PostDetailPageComponent],
    ['creators', CreatorsSearchPageComponent],
    ['creators/:id', CreatorProfilePageComponent],
    ['share/:token', SharedPostPageComponent],
    ['login', LoginPageComponent],
    ['register', RegisterPageComponent],
    ['profile', ProfilePageComponent],
    ['my-posts', PostsManagementPageComponent],
    ['admin', AdminPageComponent],
  ])('%s est chargée à la demande et résout le bon composant', async (path, expected) => {
    expect(await lazyComponent(path)).toBe(expected);
  });

  it('toutes les pages sauf le catalogue sont chargées à la demande', () => {
    const eager = routes.filter((r) => r.component).map((r) => r.path);
    expect(eager).toEqual(['posts']);
  });

  it('les gardes sont conservées sur les pages protégées', () => {
    expect(route('profile').canActivate).toEqual([authGuard]);
    expect(route('my-posts').canActivate).toEqual([authGuard]);
    expect(route('admin').canActivate).toEqual([authGuard, adminGuard]);
  });

  it('les redirections historiques sont conservées (/tracks, /post/:id, route inconnue)', () => {
    expect(route('tracks').redirectTo).toBe('posts');
    expect(route('post/:id').redirectTo).toBe('posts/:id');
    expect(route('**').redirectTo).toBe('posts');
  });
});

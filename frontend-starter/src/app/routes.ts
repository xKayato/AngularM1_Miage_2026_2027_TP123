import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { adminGuard } from './shared/guards/admin.guard';
import { PostsPageComponent } from './components/posts-page/posts-page';

/**
 * Le catalogue (page d'accueil) reste dans le bundle principal pour s'afficher tout de suite.
 * Les autres pages sont chargées à la demande (loadComponent) : chacune devient un petit
 * fichier JS séparé, que PreloadAllModules (main.ts) télécharge en arrière-plan une fois
 * l'accueil affiché, pour que la navigation reste instantanée.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'posts' },
  { path: 'posts', component: PostsPageComponent },
  {
    path: 'posts/:id',
    loadComponent: () =>
      import('./components/post-detail-page/post-detail-page').then((m) => m.PostDetailPageComponent),
  },
  { path: 'post/:id', redirectTo: 'posts/:id' },
  {
    path: 'creators',
    loadComponent: () =>
      import('./components/creators-search-page/creators-search-page').then(
        (m) => m.CreatorsSearchPageComponent,
      ),
  },
  {
    path: 'creators/:id',
    loadComponent: () =>
      import('./components/creator-profile-page/creator-profile-page').then(
        (m) => m.CreatorProfilePageComponent,
      ),
  },
  {
    path: 'share/:token',
    loadComponent: () =>
      import('./components/shared-post-page/shared-post-page').then((m) => m.SharedPostPageComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./components/login-page/login-page').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./components/register-page/register-page').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./components/profile-page/profile-page').then((m) => m.ProfilePageComponent),
  },
  { path: 'tracks', redirectTo: 'posts' },
  {
    path: 'my-posts',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/posts-management-page/posts-management-page').then(
        (m) => m.PostsManagementPageComponent,
      ),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./components/admin-page/admin-page').then((m) => m.AdminPageComponent),
  },
  { path: '**', redirectTo: 'posts' },
];

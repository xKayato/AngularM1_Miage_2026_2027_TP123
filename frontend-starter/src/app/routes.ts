import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { LoginPageComponent } from './components/login-page/login-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { TracksPageComponent } from './components/tracks-page/tracks-page';
import { PostsManagementPageComponent } from './components/posts-management-page/posts-management-page';
import { PostsPageComponent } from './components/posts-page/posts-page';
import { PostDetailPageComponent } from './components/post-detail-page/post-detail-page';
import { SharedPostPageComponent } from './components/shared-post-page/shared-post-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'posts' },
  { path: 'posts', component: PostsPageComponent },
  { path: 'posts/:id', component: PostDetailPageComponent },
  { path: 'share/:token', component: SharedPostPageComponent },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'tracks', component: TracksPageComponent, canActivate: [authGuard] },
  { path: 'my-posts', component: PostsManagementPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'posts' },
];


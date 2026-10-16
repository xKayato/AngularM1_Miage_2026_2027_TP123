export type Category =
  | 'Lego'
  | 'Papercraft'
  | 'Origami'
  | 'Musique'
  | 'Modèles 3D'
  | 'Autre';

export type PostVisibility = 'public' | 'link' | 'followers' | 'subscribers';

export type PostStatus = 'draft' | 'published' | 'archived';

export type AttachmentFamily = 'image' | 'audio' | 'pdf';

export interface PostAuthor {
  id: string;
  name: string;
}

/** DTO d'aperçu d'un post (catalogue et recherche). Omet strictement content et storedName. */
export interface PostPreview {
  id: string;
  author: PostAuthor;
  title: string;
  shortDescription: string;
  category: Category;
  tags: string[];
  visibility: 'public' | 'followers' | 'subscribers';
  likesCount: number;
  attachmentsCount: number;
  hasAudio: boolean;
  coverUrl: string | null;
  publishedAt: string | null;
  isLocked: boolean;
}

export interface AttachmentInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  family: AttachmentFamily;
  downloadUrl: string;
  isCover?: boolean;
}

export interface UserInteractions {
  isLiked: boolean;
  isFollowingAuthor: boolean;
  isSubscribedToAuthor: boolean;
  subscriptionExpiresAt: string | null;
}

/** DTO de détail complet pour les lecteurs autorisés. */
export interface PostDetail {
  id: string;
  author: PostAuthor;
  title: string;
  shortDescription: string;
  content: string;
  category: Category;
  tags: string[];
  visibility: PostVisibility;
  status: PostStatus;
  likesCount: number;
  attachments: AttachmentInfo[];
  userInteractions: UserInteractions;
  publishedAt: string | null;
  archivedAt?: string | null;
  archiveReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ShareLinkStatus = 'none' | 'active' | 'expired' | 'revoked';

export interface ShareLinkInfo {
  hasLink: boolean;
  status: ShareLinkStatus;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface ShareLinkCreatedResponse {
  shareUrl: string;
  expiresAt: string;
  expiresInDays: number;
}

/** DTO d'espace auteur enrichi de la gestion du lien sans secret brut. */
export interface PostAuthorManagement extends PostDetail {
  shareLinkInfo?: ShareLinkInfo;
}

export interface CreatePostDto {
  title: string;
  shortDescription: string;
  content: string;
  category: Category;
  tags: string[];
}

export interface UpdatePostDto {
  title?: string;
  shortDescription?: string;
  content?: string;
  category?: Category;
  tags?: string[];
}

export interface PublishPostDto {
  visibility: PostVisibility;
}

export interface PostFilterParams {
  page?: number;
  limit?: number;
  query?: string;
  tags?: string | string[];
  category?: string;
  mode?: 'catalog' | 'suggest';
}

export interface MyPostsFilterParams {
  page?: number;
  limit?: number;
  status?: 'all' | 'draft' | 'published' | 'archived';
}

export interface ApiErrorResponse {
  message: string;
}

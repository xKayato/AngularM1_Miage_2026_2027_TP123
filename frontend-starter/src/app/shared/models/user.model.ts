/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  bio?: string;
  profileTags?: string[];
  hasAvatar?: boolean;
  avatarUrl?: string | null;
  createdAt: string;
}


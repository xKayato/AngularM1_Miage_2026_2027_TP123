/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  createdAt: string;
}


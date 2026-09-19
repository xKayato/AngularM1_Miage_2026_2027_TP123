/** Possible authentication states for the application. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/** Credentials sent to /api/auth/login. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Payload sent to /api/auth/register. */
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

/** Payload sent to PUT /api/users/me. */
export interface UpdateProfileRequest {
  name: string;
}

import { useAuth } from 'react-oidc-context';

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function getRoles(profile: Record<string, unknown> | undefined, accessToken: string | undefined): string[] {
  // Try ID token profile first
  const fromProfile = (profile?.realm_access as { roles?: string[] })?.roles;
  if (fromProfile && fromProfile.length > 0) return fromProfile;

  // Fallback: decode access token
  if (accessToken) {
    const decoded = decodeJwtPayload(accessToken);
    const fromToken = (decoded.realm_access as { roles?: string[] })?.roles;
    if (fromToken && fromToken.length > 0) return fromToken;
  }

  return [];
}

export function useAuthUser() {
  const auth = useAuth();

  const profile = auth.user?.profile as Record<string, unknown> | undefined;
  const accessToken = auth.user?.access_token;
  const roles = getRoles(profile, accessToken);

  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    userId: (profile?.preferred_username as string) || '',
    email: (profile?.email as string) || '',
    firstName: (profile?.given_name as string) || '',
    lastName: (profile?.family_name as string) || '',
    fullName: [profile?.given_name, profile?.family_name].filter(Boolean).join(' ') || (profile?.preferred_username as string) || '',
    roles,
    hasRole: (role: string) => roles.includes(role),
    login: () => auth.signinRedirect(),
    logout: () => auth.signoutRedirect(),
    accessToken: accessToken || '',
    user: auth.user,
  };
}

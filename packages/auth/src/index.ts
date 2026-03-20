export { getKeycloakUrl, getKeycloakRealm, getKeycloakAuthority, getApiBase, getPortalDataspaceUrl, getPortalWalletUrl, getPortalCompanyUrl } from './config';

export const ROLES = {
  ADMIN: 'admin',
  CUSTOMER: 'customer',
  INSURANCE_AGENT: 'insurance_agent',
  COMPANY_ADMIN: 'company_admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export function extractRoles(user: { profile?: { realm_access?: { roles?: string[] } } } | null): string[] {
  return user?.profile?.realm_access?.roles || [];
}

export function hasRole(user: { profile?: { realm_access?: { roles?: string[] } } } | null, role: string): boolean {
  return extractRoles(user).includes(role);
}

export { AuthProvider } from './AuthProvider';
export { useAuthUser } from './useAuthUser';
export { ProtectedRoute } from './ProtectedRoute';
export { createAuthAxios } from './authAxios';
export { LoginPage } from './LoginPage';
export type { PortalTheme } from './LoginPage';

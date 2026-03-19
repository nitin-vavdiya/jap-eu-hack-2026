import React from 'react';
import { useAuth } from 'react-oidc-context';
import { LoginPage, PortalTheme } from './LoginPage';

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function userHasRole(profile: Record<string, unknown> | undefined, accessToken: string | undefined, role: string): boolean {
  // Check ID token profile
  const fromProfile = (profile?.realm_access as { roles?: string[] })?.roles;
  if (fromProfile?.includes(role)) return true;

  // Fallback: decode access token
  if (accessToken) {
    const decoded = decodeJwtPayload(accessToken);
    const fromToken = (decoded.realm_access as { roles?: string[] })?.roles;
    if (fromToken?.includes(role)) return true;
  }

  return false;
}

interface Props {
  role?: string;
  theme?: PortalTheme;
  children: React.ReactNode;
}

export function ProtectedRoute({ role, theme, children }: Props) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-gray-400">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    if (theme) {
      return <LoginPage theme={theme} />;
    }
    auth.signinRedirect();
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Redirecting to login...</p>
      </div>
    );
  }

  const profile = auth.user?.profile as Record<string, unknown> | undefined;
  const accessToken = auth.user?.access_token;

  if (role && !userHasRole(profile, accessToken, role)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Access Denied</h2>
          <p className="text-sm text-gray-400 mb-4">You do not have the required role: <span className="font-mono text-gray-600">{role}</span></p>
          <button
            onClick={() => auth.signoutRedirect()}
            className="text-sm text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            Sign out and try a different account
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

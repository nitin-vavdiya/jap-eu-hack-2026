import React from 'react';
import { AuthProvider as OidcAuthProvider } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { KEYCLOAK_AUTHORITY } from './index';

interface Props {
  clientId: string;
  children: React.ReactNode;
}

export function AuthProvider({ clientId, children }: Props) {
  const oidcConfig = {
    authority: KEYCLOAK_AUTHORITY,
    client_id: clientId,
    redirect_uri: window.location.origin + '/',
    post_logout_redirect_uri: window.location.origin + '/',
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    onSigninCallback: () => {
      // Remove OIDC query params from URL after login
      window.history.replaceState({}, document.title, window.location.pathname);
    },
  };

  return (
    <OidcAuthProvider {...oidcConfig}>
      {children}
    </OidcAuthProvider>
  );
}

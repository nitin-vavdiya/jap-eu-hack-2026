declare global {
  interface Window {
    __CONFIG__?: {
      KEYCLOAK_URL?: string;
      KEYCLOAK_REALM?: string;
      API_BASE_URL?: string;
      PORTAL_DATASPACE_URL?: string;
      PORTAL_WALLET_URL?: string;
      PORTAL_COMPANY_URL?: string;
    };
  }
}

export function getKeycloakUrl(): string {
  return window.__CONFIG__?.KEYCLOAK_URL || 'http://localhost:8080';
}

export function getKeycloakRealm(): string {
  return window.__CONFIG__?.KEYCLOAK_REALM || 'eu-jap-hack';
}

export function getKeycloakAuthority(): string {
  return `${getKeycloakUrl()}/realms/${getKeycloakRealm()}`;
}

export function getApiBase(): string {
  return window.__CONFIG__?.API_BASE_URL || 'http://localhost:8000/api';
}

export function getPortalDataspaceUrl(): string {
  return window.__CONFIG__?.PORTAL_DATASPACE_URL || 'http://localhost:3001';
}

export function getPortalWalletUrl(): string {
  return window.__CONFIG__?.PORTAL_WALLET_URL || 'http://localhost:3004';
}

export function getPortalCompanyUrl(): string {
  return window.__CONFIG__?.PORTAL_COMPANY_URL || 'http://localhost:3006';
}

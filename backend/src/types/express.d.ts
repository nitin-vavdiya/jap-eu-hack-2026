declare namespace Express {
  interface Request {
    user?: {
      sub: string;
      preferred_username: string;
      email?: string;
      given_name?: string;
      family_name?: string;
      realm_access?: {
        roles: string[];
      };
    };
    requestId: string;
    log: import('pino').Logger;
  }
}

import React from 'react';
import { useAuth } from 'react-oidc-context';

export interface PortalTheme {
  portalName: string;
  subtitle: string;
  primaryColor: string;
  primaryHover: string;
  accentGradient: string;
  iconText: string;
  iconBg: string;
  description: string;
  features: string[];
  loginHint?: string;
}

export function LoginPage({ theme }: { theme: PortalTheme }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFD]">
        <div className="text-center">
          <div className={`w-12 h-12 ${theme.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
            <span className="text-white font-bold text-sm">{theme.iconText}</span>
          </div>
          <div className="animate-spin w-6 h-6 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-[#9AA0A6]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFD] flex">
      {/* Left panel — branding */}
      <div className={`hidden lg:flex lg:w-1/2 ${theme.accentGradient} relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 400 400">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="400" height="400" fill="url(#grid)" />
          </svg>
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 py-12">
          <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-8 shadow-lg">
            <span className="text-white font-bold text-lg">{theme.iconText}</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 leading-tight">{theme.portalName}</h1>
          <p className="text-lg text-white/80 mb-10">{theme.subtitle}</p>

          <div className="space-y-4">
            {theme.features.map((feature, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white/90 text-sm">{feature}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-16">
            <p className="text-white/40 text-xs">Secured by Keycloak OIDC</p>
          </div>
        </div>
      </div>

      {/* Right panel — login */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10">
            <div className={`w-12 h-12 ${theme.iconBg} rounded-2xl flex items-center justify-center mb-4 shadow-lg`}>
              <span className="text-white font-bold text-sm">{theme.iconText}</span>
            </div>
            <h1 className="text-2xl font-bold text-[#1F1F1F]">{theme.portalName}</h1>
            <p className="text-sm text-[#9AA0A6] mt-1">{theme.subtitle}</p>
          </div>

          <div className="hidden lg:block mb-10">
            <h2 className="text-2xl font-bold text-[#1F1F1F]">Welcome back</h2>
            <p className="text-sm text-[#9AA0A6] mt-1">Sign in to access {theme.portalName}</p>
          </div>

          <p className="text-sm text-[#5F6368] mb-6">{theme.description}</p>

          <button
            onClick={() => auth.signinRedirect()}
            className={`w-full ${theme.primaryColor} ${theme.primaryHover} text-white py-3.5 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-xl active:scale-[0.98]`}
          >
            Sign in with Keycloak
          </button>

          {theme.loginHint && (
            <div className="mt-6 bg-[#F1F3F6] rounded-xl px-4 py-3">
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-1.5">Demo Credentials</p>
              <p className="text-xs text-[#5F6368] font-mono">{theme.loginHint}</p>
            </div>
          )}

          <div className="mt-8 flex items-center gap-3">
            <div className="flex-1 border-t border-[#E5EAF0]"></div>
            <span className="text-[10px] text-[#9AA0A6] uppercase tracking-widest">Secured</span>
            <div className="flex-1 border-t border-[#E5EAF0]"></div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-6">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[#9AA0A6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-[10px] text-[#9AA0A6]">OAuth 2.0</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[#9AA0A6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-[10px] text-[#9AA0A6]">OpenID Connect</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[#9AA0A6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-[10px] text-[#9AA0A6]">Verifiable Credentials</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

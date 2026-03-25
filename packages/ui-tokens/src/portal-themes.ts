export interface PortalBrand {
  name: string;
  subtitle: string;
  accent: string;
  accentHex: string;
  gradient: string;
  iconText: string;
  personality: string;
}

export const portalBrands: Record<string, PortalBrand> = {
  dataspace: {
    name: 'EU APAC Dataspace',
    subtitle: 'Organization Registry & Credential Management',
    accent: 'blue',
    accentHex: '#4285F4',
    gradient: 'from-[#4285F4] via-[#3367D6] to-[#1A56DB]',
    iconText: 'DS',
    personality: 'enterprise trust',
  },
  tataAdmin: {
    name: 'Toyota Admin',
    subtitle: 'Fleet & DPP Management Console',
    accent: 'blue',
    accentHex: '#4285F4',
    gradient: 'from-[#1A56DB] via-[#2563EB] to-[#3B82F6]',
    iconText: 'TY',
    personality: 'operational and data-rich',
  },
  tataPublic: {
    name: 'Toyota',
    subtitle: 'Digital Showroom',
    accent: 'blue',
    accentHex: '#4285F4',
    gradient: 'from-[#4285F4] via-[#60A5FA] to-[#93C5FD]',
    iconText: 'TY',
    personality: 'premium automotive',
  },
  wallet: {
    name: 'SmartSense Wallet',
    subtitle: 'Digital Identity & Credentials',
    accent: 'green',
    accentHex: '#34A853',
    gradient: 'from-[#34A853] via-[#2D9249] to-[#1E7E34]',
    iconText: 'SS',
    personality: 'futuristic trust + consent',
  },
  insurance: {
    name: 'Tokio Marine',
    subtitle: 'Smart Vehicle Coverage',
    accent: 'yellow',
    accentHex: '#FBBC05',
    gradient: 'from-[#FBBC05] via-[#F59E0B] to-[#D97706]',
    iconText: 'TM',
    personality: 'reassuring and frictionless',
  },
};

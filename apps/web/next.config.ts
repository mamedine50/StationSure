import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Les packages internes sont consommés en source TypeScript (pas d'étape de build).
  transpilePackages: ['@stationsure/core', '@stationsure/ui', '@stationsure/i18n'],
  typedRoutes: true,
};

export default nextConfig;

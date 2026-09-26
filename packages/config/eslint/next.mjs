import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

import { baseConfig } from './base.mjs';

/**
 * Configuration ESLint pour apps/web (Next.js App Router).
 * @type {import('eslint').Linter.Config[]}
 */
export const nextConfig = [...baseConfig, ...nextCoreWebVitals, ...nextTypescript, prettier];

export default nextConfig;

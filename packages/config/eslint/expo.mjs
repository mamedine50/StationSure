import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';

import { baseConfig } from './base.mjs';

/**
 * Configuration ESLint pour apps/mobile (Expo + expo-router).
 * @type {import('eslint').Linter.Config[]}
 */
export const expoFlatConfig = [...baseConfig, ...expoConfig, prettier];

export default expoFlatConfig;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withNativeWind } = require('nativewind/metro');

// expo/metro-config détecte le monorepo pnpm (watchFolders + nodeModulesPaths).
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });

/* eslint-disable @typescript-eslint/no-require-imports */
const nativewindPreset = require('nativewind/preset');
const { stationsurePreset } = require('@stationsure/ui/tailwind');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [nativewindPreset, stationsurePreset('native')],
};

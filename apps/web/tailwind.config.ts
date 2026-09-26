import type { Config } from 'tailwindcss';

import { stationsurePreset } from '@stationsure/ui/tailwind';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [stationsurePreset('web')],
} satisfies Config;

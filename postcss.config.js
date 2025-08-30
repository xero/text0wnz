import tailwindcss from '@tailwindcss/postcss';
import cssnano from 'cssnano';

export default {
  darkMode: 'media',
  plugins: [
    tailwindcss,
    cssnano({
      preset: 'advanced',
    }),
  ],
};

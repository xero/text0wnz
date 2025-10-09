import tailwindcss from '@tailwindcss/postcss';
import cssnano from 'cssnano';

export default {
  plugins: [
    () => {
      console.log('\nProcessing with PostCSS');
    },
    tailwindcss,
    cssnano({
      preset: 'advanced',
    }),
  ],
};

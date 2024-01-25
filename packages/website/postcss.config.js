/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {
      // TODO: This should be removed after `bright` https://github.com/postcss/autoprefixer?tab=readme-ov-file#control-comments for auto prefixes
      add: false,
    },
  },
};

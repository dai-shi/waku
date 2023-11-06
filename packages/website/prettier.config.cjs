/** @type {import('prettier').Config} */
module.exports = {
  plugins: ['prettier-plugin-tailwindcss'],
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  jsxSingleQuote: false,
  printWidth: 100,
  quoteProps: 'consistent',
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  tailwindConfig: './tailwind.config.js',
  tailwindFunctions: ['cx'],
};

import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: colors.black,
      white: colors.white,
      gray: colors.stone,
      primary: {
        DEFAULT: '#BE132D',
        50: '#FCE3E7',
        100: '#F9C7CF',
        200: '#F4909F',
        300: '#EF5D73',
        400: '#E92543',
        500: '#BE132D',
        600: '#990F24',
        700: '#740C1B',
        800: '#4A0711',
        900: '#250409',
        950: '#130204',
      },
      secondary: {
        DEFAULT: '#EF6177',
        50: '#FEF1F3',
        100: '#FCDFE3',
        200: '#F8BEC7',
        300: '#F6A2AF',
        400: '#F28293',
        500: '#EF6177',
        600: '#E92543',
        700: '#B9132C',
        800: '#780C1C',
        900: '#3C060E',
        950: '#200308',
      },
    },
    fontFamily: {
      serif: ['"Alegreya"', 'serif'],
      sans: ['"Nunito"', 'sans-serif'],
      mono: ['"Fira Code"', 'monospace'],
      simple: ['"Inter"', 'sans-serif'],
    },
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      zIndex: {
        60: '60',
        70: '70',
        80: '80',
        90: '90',
        100: '100',
      },
    },
  },
  plugins: [],
  future: {
    hoverOnlyWhenSupported: true,
  },
};

import { createTheme, MantineColorsTuple } from '@mantine/core';

const myColor: MantineColorsTuple = [
  '#fff4e2',
  '#ffe9cc',
  '#ffd09c',
  '#fdb766',
  '#fca13a',
  '#fb931d',
  '#fc8c0c',
  '#e17900',
  '#c86a00',
  '#ae5a00',
];

export const theme = createTheme({
  fontFamily: 'Open Sans, sans-serif',
  primaryColor: 'orange',
  colors: {
    myColor,
  },
});

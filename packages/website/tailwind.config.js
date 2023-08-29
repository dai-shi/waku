/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./{src,routes}/**/*.{ts,tsx}"],
  theme: {
    colors: {
      cCarmine: "#B0452D",
      cVanilla: "#ECC5BC",
      cBlack: "#392B28",
      cWhite: "#FAF7F7",
      transparent: "#00000000",
    },
  },
  plugins: [],
};

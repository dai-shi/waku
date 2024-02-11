/** @type {import('vite').UserConfig} */
export default {
  ssr: {
    resolve: {
      // HACK for decode-named-character-reference
      // not to pick the browser version
      // https://unpkg.com/browse/decode-named-character-reference@1.0.2/package.json
      conditions: ['worker'],
    },
  },
};

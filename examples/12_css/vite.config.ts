import url from 'node:url'
import path from 'node:path'
// import { defineConfig } from 'waku/config'
import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import Inspect from 'vite-plugin-inspect'
export default defineConfig({
  root: path.dirname(url.fileURLToPath(import.meta.url)),
  plugins: [vanillaExtractPlugin({ emitCssInSsr: true }), 
    // Inspect(),
     {
    name: 'debug',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('.vanilla.css')) {
        console.trace(id)
      }
    }
    
  }]
})

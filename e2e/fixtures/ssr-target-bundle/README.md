# SSR Bundling for NPM packages with environment depended code parts

Choosing the right code based on the `export` section of the `react-textarea-autosize` module based on the backend server deployment target ('node' | 'webworker') and the client browser. No browser only code should be bundled with server only code.

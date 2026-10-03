import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';
import type { MetadataFilter } from '../utils-server/html-metadata.js';

type HtmlTransformOptions = {
  /**
   * The `<meta>` names and properties a page overrides its layout's under, or
   * `false` to serve every head as rendered. `<title>` is merged whatever the
   * filter names, and the defaults fill in a field it leaves out. Name only
   * keys whose consumers resolve the first occurrence: React appends on
   * hydration whatever the served HTML omits, which inverts any other.
   */
  mergeMetadata?: Partial<MetadataFilter> | false;
  /**
   * A positive integer: how many bytes of an unclosed head to buffer before
   * emitting it as rendered, counting the RSC payload injected upstream.
   */
  maxBufferedHead?: number;
};

const MODULE_ID = 'virtual:vite-rsc-waku/html-transform';

/**
 * Merges the metadata React renders into a server-rendered head, so that a
 * page's `<title>` and `<meta>` tags override the ones its layout declared.
 */
export function htmlTransformPlugin(
  options: HtmlTransformOptions = {},
): Plugin {
  const { mergeMetadata, maxBufferedHead } = options;
  const runtime = normalizePath(
    fileURLToPath(new URL('../utils-server/html-metadata.js', import.meta.url)),
  );
  return {
    name: 'waku:vite-plugins:html-transform',
    resolveId(source, _importer, _options) {
      if (source !== MODULE_ID) {
        return undefined;
      }
      assert(this.environment.name === 'ssr');
      return '\0' + MODULE_ID;
    },
    load(id) {
      if (id !== '\0' + MODULE_ID) {
        return;
      }
      if (mergeMetadata === false) {
        return `export default undefined;`;
      }
      const args = [JSON.stringify(mergeMetadata ?? {})];
      if (maxBufferedHead !== undefined) {
        args.push(String(maxBufferedHead));
      }
      return `
import { dedupeHtmlMetadataStream } from ${JSON.stringify(runtime)};
const transform = () => dedupeHtmlMetadataStream(${args.join(', ')});
export default transform;
`;
    },
  };
}

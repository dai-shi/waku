import adapter from 'waku/adapters/default';
import App from './components/App.js';
import { MultipleRootAction } from './components/MultipleRootAction.js';

const BUILD_MATADATA_KEY = 'metadata-key';
const BUILD_MATADATA_VALUE = 'metadata-value';

export default adapter({
  handleRequest: async (input, { renderRsc, loadBuildMetadata }) => {
    const enhanced = input.req.headers.get('X-Enhancer');
    if (input.type === 'rsc') {
      if (
        input.rscPath === 'first' ||
        input.rscPath === 'second' ||
        input.rscPath === 'third'
      ) {
        return renderRsc(
          {
            enhancedBy: null,
            EnhancerInput: enhanced
              ? JSON.stringify([enhanced, input.rscPath, input.rscParams])
              : null,
            Content: (
              <div>
                <p>{input.rscPath}</p>
                <MultipleRootAction name={input.rscPath} />
              </div>
            ),
          },
          { etags: { Content: input.rscPath } },
        );
      }
      return renderRsc({
        App: (
          <App
            name={input.rscPath || 'Waku'}
            params={input.rscParams}
            metadata={(await loadBuildMetadata(BUILD_MATADATA_KEY)) || 'Empty'}
          />
        ),
      });
    }
    if (input.type === 'call') {
      const value = await input.fn(...input.args);
      return renderRsc(
        {
          ...(value === 'update-content'
            ? { Content: <p>updated content</p> }
            : {}),
          ...(enhanced ? { EnhancerInput: enhanced } : {}),
        },
        { value },
      );
    }
    return 'fallback';
  },
  handleBuild: async ({ saveBuildMetadata }) => {
    await saveBuildMetadata(BUILD_MATADATA_KEY, BUILD_MATADATA_VALUE);
  },
});

import { ServerRouter } from "../lib/server.js";

import { routeTree } from "../routes.js";

const App = ({ path }: { path: string }) => {
  return <ServerRouter rootTree={routeTree} path={path.slice(1)} />;
};

export default App;

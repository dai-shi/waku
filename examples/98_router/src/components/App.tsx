import { ServerRouter } from "../lib/server.js";

import { routeTree } from "../routes.js";

const App = ({ path = "/" }) => {
  return <ServerRouter rootTree={routeTree} path={path} />;
};

export default App;

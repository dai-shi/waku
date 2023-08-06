import { Route, RootRoute } from "./lib/common.js";
import { Link } from "./lib/client.js";

const rootRoute = new RootRoute({
  component: ({ children }) => (
    <>
      <div>
        <Link to="/">Home</Link> <Link to="/about">About</Link>
      </div>
      <hr />
      {children}
    </>
  ),
});

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  component: function Index() {
    return (
      <div>
        <h3>Welcome Home!</h3>
      </div>
    );
  },
});

const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: function About() {
    return <div>Hello from About!</div>;
  },
});

export const routeTree = rootRoute.addChildren([indexRoute, aboutRoute]);

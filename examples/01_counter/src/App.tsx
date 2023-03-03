import React from "react";

import { Counter } from "./Counter";

const App = ({ name = "Anonymous" }) => {
  return (
    <div>
      <h1>Hello {name}!!</h1>
      <Counter />
    </div>
  );
};

export default App;

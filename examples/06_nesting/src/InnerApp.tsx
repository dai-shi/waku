import { Counter } from "./Counter.tsx";

const InnerApp = ({ count = -1 }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h3>This is another server component.</h3>
      <p>The outer count is {count}.</p>
      <Counter />
    </div>
  );
};

export default InnerApp;

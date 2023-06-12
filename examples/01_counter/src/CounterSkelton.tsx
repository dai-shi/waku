export const CounterSkelton = () => (
  <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
    <p>Count: {0}</p>
    <button disabled>Increment</button>
    <h3>This is a (server rendered) client component.</h3>
  </div>
);

export const CounterSkeleton = () => (
  <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
    <p>Count: {0}</p>
    <button disabled>Increment</button>
    <h3>This is a server skeleton component for a client component.</h3>
  </div>
);

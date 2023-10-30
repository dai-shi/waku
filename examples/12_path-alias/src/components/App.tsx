import { Client } from "@/components/Client.js";

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Client />
    </div>
  );
};

export default App;

import { Component } from 'component';

const App = ({ name }: { name: string }) => {
  return (
    <html>
    <head>
      <title>Waku example</title>
    </head>
    <body>
    <Component name={name}/>
    </body>
    </html>
  );
};

export default App;

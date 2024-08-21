import { ContextProvider } from './context-provider.js';
import { ContextConsumer } from './context-consumer.js';

export default function App() {
  return (
    <html>
      <head></head>
      <body>
        <div>
          <ContextProvider>
            <ContextConsumer />
          </ContextProvider>
        </div>
      </body>
    </html>
  );
}

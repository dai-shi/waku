import { ContextProvider } from './context-provider.js';
import { ContextConsumer } from './context-consumer.js';

export default function App() {
  return (
    <div>
      <ContextProvider>
        <ContextConsumer />
      </ContextProvider>
    </div>
  );
}

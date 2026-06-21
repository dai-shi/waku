import '../stylex.css';
import * as stylex from '@stylexjs/stylex';
import { ClientCounter } from '../components/ClientCounter';
import { DevStyleXInject } from '../components/DevStyleXInject';
import { vanillaServerStyle } from '../styles.css';

const styles = stylex.create({
  server: {
    borderColor: 'green',
    borderStyle: 'solid',
    borderWidth: '1px',
    padding: '8px',
  },
});

export default function HomePage() {
  return (
    <main>
      <DevStyleXInject />
      <h1>CSS plugin integrations</h1>
      <p className={vanillaServerStyle} data-testid="vanilla-server">
        Vanilla server style
      </p>
      <p {...stylex.props(styles.server)} data-testid="stylex-server">
        StyleX server style
      </p>
      <ClientCounter />
    </main>
  );
}

import { create, props } from '@stylexjs/stylex';
// eslint-disable-next-line import/no-unresolved
import '@stylex-dev.css';

const styles = create({
  root: {
    backgroundColor: '#000',
    color: '#fff',
    padding: '10px',
    textAlign: 'center',
  },
});

export const Banner = () => {
  return <div {...props(styles.root)}>This is a banner by StyleX CSS</div>;
};

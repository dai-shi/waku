import stylex from '@stylexjs/stylex';

const styles = stylex.create({
  root: {
    backgroundColor: '#000',
    color: '#fff',
    padding: '10px',
    textAlign: 'center',
  },
});

export const Banner = () => {
  return (
    <div {...stylex.props(styles.root)}>This is a banner by StyleX CSS</div>
  );
};

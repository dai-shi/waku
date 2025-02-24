import styles from './css-modules.module.css';

export default async function CssModules() {
  return (
    <div>
      <h1 data-testid="css-modules-header" className={styles.h1}>
        CSS Modules
      </h1>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};

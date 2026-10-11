export default function NoSsrPage() {
  return (
    <main>
      <h1 data-testid="title">No SSR Nonce Test</h1>
      <p data-testid="message">Hello from a dynamic page without SSR!</p>
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
    unstable_disableSSR: true,
  } as const;
};

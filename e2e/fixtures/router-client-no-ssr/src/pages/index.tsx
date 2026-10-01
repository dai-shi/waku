export default function HomePage() {
  return <h1>Home</h1>;
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

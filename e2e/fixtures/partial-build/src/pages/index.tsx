export default function HomePage() {
  return <div>Home</div>;
}

export async function getConfig() {
  return {
    render: 'static',
  };
}

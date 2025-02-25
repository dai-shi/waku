export default async function DestinationPage() {
  return (
    <div>
      <h1>Destination Page</h1>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};

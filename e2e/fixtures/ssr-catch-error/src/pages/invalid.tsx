export default async function InvalidPage() {
  return (
    <div>
      <p>Invalid Page</p>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};

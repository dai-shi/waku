export const ThrowsComponent = async () => {
  await new Promise((_, reject) => {
    reject(new Error('Unexpected error'));
  });
  return <div>Success</div>;
};

export default ThrowsComponent;

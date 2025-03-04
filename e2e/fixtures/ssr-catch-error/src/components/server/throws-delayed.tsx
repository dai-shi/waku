export const ThrowsDelayedComponent = async () => {
  await new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Delayed unexpected error'));
    }, 100);
  });
  return <div>Success</div>;
};

export default ThrowsDelayedComponent;

const ErrorRender = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1));
  throw new Error('Something unexpected happened');
};
export default ErrorRender;

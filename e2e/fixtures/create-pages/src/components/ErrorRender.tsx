const ErrorRender = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1));
  throw new Error('Intentional render error');
};
export default ErrorRender;

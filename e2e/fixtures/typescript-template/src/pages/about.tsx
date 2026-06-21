const AboutPage = () => (
  <>
    <title>Waku About</title>
    <h1 data-testid="title" className="text-3xl font-semibold">
      About TypeScript
    </h1>
    <p>This route verifies managed file-system routing in the template.</p>
  </>
);

export default AboutPage;

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};

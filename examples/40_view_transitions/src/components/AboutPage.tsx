const AboutPage = () => (
  <div style={{ padding: '2rem' }}>
    <h1
      style={{
        viewTransitionName: 'page-title',
        fontSize: '2rem',
        marginBottom: '1rem',
      }}
    >
      About Waku
    </h1>
    <div
      style={{
        viewTransitionName: 'page-content',
        backgroundColor: '#f8fafc',
        padding: '2rem',
        borderRadius: '0.5rem',
      }}
    >
      <p>This is the about page with a different background color.</p>
    </div>
  </div>
);

export default AboutPage;

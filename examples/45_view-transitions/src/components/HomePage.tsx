const HomePage = () => (
  <div style={{ padding: '2rem' }}>
    <h1
      style={{
        viewTransitionName: 'page-title',
        fontSize: '2rem',
        marginBottom: '1rem',
      }}
    >
      Waku view transitions
    </h1>
    <div
      style={{
        viewTransitionName: 'page-content',
        backgroundColor: '#e2e8f0',
        padding: '2rem',
        borderRadius: '0.5rem',
      }}
    >
      <p>This is the home page. Navigate to see view transitions in action!</p>
    </div>
  </div>
);

export default HomePage;

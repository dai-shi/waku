'use server';

export async function greet() {
  const now = new Date().toISOString();
  console.log('greet', now);
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <p>Hello from server ({now})</p>
    </div>
  );
}

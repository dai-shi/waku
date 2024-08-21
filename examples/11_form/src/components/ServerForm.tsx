async function requestUsername(formData: FormData) {
  'use server';
  const username = formData.get('username');
  console.log(`username: ${username}`);
}

// FIXME make this example more realistic
export const ServerForm = () => {
  return (
    <>
      <form action={requestUsername}>
        <input type="text" name="username" />
        <button type="submit">Request</button>
      </form>
      <form
        action={async (formData: FormData) => {
          'use server';
          const hobby = formData.get('hobby');
          console.log(`hobby: ${hobby}`);
        }}
      >
        <input type="text" name="hobby" />
        <button type="submit">Request</button>
      </form>
    </>
  );
};

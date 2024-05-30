async function requestUsername(formData: FormData) {
  'use server';
  const username = formData.get('username');
  console.log(`username: ${username}`);
}

export const ServerForm = () => {
  return (
    <form action={requestUsername}>
      <input type="text" name="username" />
      <button type="submit">Request</button>
    </form>
  );
};

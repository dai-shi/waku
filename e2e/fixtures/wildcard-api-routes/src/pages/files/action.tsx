import { unstable_rerenderRoute } from 'waku/router/server';

let submittedName = '';

async function submit(formData: FormData) {
  'use server';
  submittedName = String(formData.get('name') || '');
  unstable_rerenderRoute('/files/action');
}

const Page = () => (
  <div>
    <h1>Action under API wildcard</h1>
    <p data-testid="action-message">
      {submittedName ? `Submitted: ${submittedName}` : 'No submission'}
    </p>
    <form action={submit}>
      <label htmlFor="action-name">Name</label>
      <input id="action-name" name="name" required />
      <button type="submit">Submit Action</button>
    </form>
  </div>
);

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};

export default Page;

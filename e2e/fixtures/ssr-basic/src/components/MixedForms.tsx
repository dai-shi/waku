import { StatefulForm } from './StatefulForm.js';

let echo = 'none';

export const receivePlainPost = (formData: FormData) => {
  echo = `custom:${String(formData.get('plain-field') || '')}`;
};

async function submitAction(formData: FormData) {
  'use server';
  echo = `action:${String(formData.get('name') || '')}`;
}

async function submitStateful(prev: string, _formData: FormData) {
  'use server';
  echo = 'action:stateful';
  return `updated:${prev}`;
}

async function submitPermalink(prev: string, _formData: FormData) {
  'use server';
  echo = 'action:permalink';
  return `updated:${prev}`;
}

export const MixedForms = () => (
  <html>
    <head>
      <title>Mixed Forms</title>
    </head>
    <body>
      <h2>Mixed Forms</h2>
      <p data-testid="echo">{echo}</p>
      <form action={submitAction}>
        <input name="name" aria-label="Name" />
        <button type="submit" data-testid="action-submit">
          Action
        </button>
      </form>
      <StatefulForm action={submitStateful} />
      <StatefulForm
        action={submitPermalink}
        idPrefix="permalink"
        permalink="/mixed-forms"
      />
      <form method="post" encType="multipart/form-data">
        <input name="plain-field" defaultValue="plain-value" />
        <button type="submit" data-testid="plain-submit">
          Plain
        </button>
      </form>
    </body>
  </html>
);

import { LibraryComponent } from 'ui-library';

export default async function Test() {
  return <LibraryComponent />;
}

export async function getConfig() {
  return {
    render: 'static',
  };
}

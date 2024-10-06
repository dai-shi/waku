import ButtonClient from './ButtonClient';

let counter = 0;

const ButtonServer = ({ name }: { name: string }) => {
  const now = Date.now();
  async function handleClick() {
    'use server';
    console.log('Button clicked!', name, now, ++counter);
  }
  return (
    <div>
      {name} <ButtonClient onClick={handleClick} />
    </div>
  );
};

export default ButtonServer;

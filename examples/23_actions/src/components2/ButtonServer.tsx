import ButtonClient from './ButtonClient';

let counter = 0;

const ButtonServer = ({ name }: { name: string }) => {
  async function handleClick() {
    'use server';
    console.log('Button clicked!', name, ++counter);
  }
  return <ButtonClient onClick={handleClick} />;
};

export default ButtonServer;

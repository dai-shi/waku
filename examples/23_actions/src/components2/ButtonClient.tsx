'use client';

export default function ButtonClient({
  onClick,
}: {
  onClick: () => Promise<void>;
}) {
  console.log(onClick);
  return <button onClick={onClick}>Click me!</button>;
}

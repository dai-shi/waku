'use client';

export default function ButtonClient({
  onClick,
}: {
  onClick: () => Promise<void>;
}) {
  return <button onClick={() => onClick()}>Click me!</button>;
}

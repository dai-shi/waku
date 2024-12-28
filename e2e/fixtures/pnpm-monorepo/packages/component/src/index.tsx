type Props = {
  name: string
}

export const Component = (props: Props) => {
  return <div>Hello, {props.name}</div>;
}
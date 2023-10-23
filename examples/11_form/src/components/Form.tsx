/// <reference types="react-dom/canary" />
//
"use client";

// @ts-expect-error no exported member
import { useFormStatus } from "react-dom";

const FormStatus = () => {
  const { pending } = useFormStatus();
  return pending ? "Pending..." : null;
};

export const Form = ({
  message,
  greet,
}: {
  message: string;
  greet: (formData: FormData) => Promise<void>;
}) => (
  <div style={{ border: "3px blue dashed", margin: "1em", padding: "1em" }}>
    <p>{message}</p>
    {/* @ts-expect-error not assignable to type 'string' */}
    <form action={greet}>
      Name: <input name="name" />
      <input type="submit" value="Send" />
      <FormStatus />
    </form>
    <h3>This is a client component.</h3>
  </div>
);

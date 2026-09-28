export function FieldError({ message, id }: { message: string; id?: string }) {
  return (
    <p id={id} role="alert" className="text-sm font-medium text-seal">
      {message}
    </p>
  );
}

import { User2 } from 'lucide-react';

export default function ChatAvatar({ role }: { role: string }) {
  if (role === 'user') {
    return (
      <div className="bg-background flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow">
        <User2 className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border bg-black text-white shadow">
      <img
        className="rounded-md"
        src="/images/llama.png"
        width={24}
        height={24}
      />
    </div>
  );
}

import { Message } from 'ai';

export interface ChatHandler {
  messages: Message[];
  input: string;
  isLoading: boolean;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clear?: (() => void) | undefined;
  reload?: (() => void) | undefined;
  stop?: (() => void) | undefined;
}

import { type LLM, SimpleChatEngine } from 'llamaindex';

export async function createChatEngine(llm: LLM) {
  return new SimpleChatEngine({
    llm,
  });
}

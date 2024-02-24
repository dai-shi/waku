import {
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  createStreamDataTransformer,
  trimStartOfStreamHelper,
} from 'ai';
import { Response } from 'llamaindex/Response';

function createParser(res: AsyncIterable<Response>) {
  const trimStartOfStream = trimStartOfStreamHelper();
  return new ReadableStream({
    async pull(controller) {
      try {
        for await (const { response } of res) {
          const text = trimStartOfStream(response);
          if (text) {
            controller.enqueue(text);
          }
        }
      } catch (error) {
        controller.enqueue(JSON.stringify({ error: (error as any).message }));
      }
      controller.close();
    },
  });
}

export function LlamaIndexStream(
  res: AsyncIterable<Response>,
  callbacks: AIStreamCallbacksAndOptions,
) {
  return createParser(res)
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(
      createStreamDataTransformer(callbacks?.experimental_streamData),
    );
}

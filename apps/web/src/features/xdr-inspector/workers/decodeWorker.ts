import { createInspectorEngine } from './engine';
import type { InspectorRequest, InspectorResponse } from './protocol';
const engine = createInspectorEngine();
// Serialize requests: file reads are asynchronous and must not reorder edits/loads.
let queue = Promise.resolve();
self.addEventListener('message', (event: MessageEvent<InspectorRequest>) => {
  const request = event.data;
  queue = queue.then(async () => {
    let response: InspectorResponse;
    try {
      response = { id: request.id, ok: true, value: await engine.handle(request.command) };
    } catch (error) {
      response = {
        id: request.id,
        ok: false,
        error: (error instanceof Error ? error.message : 'Unable to inspect payload').slice(
          0,
          2000,
        ),
      };
    }
    self.postMessage(response);
  });
});

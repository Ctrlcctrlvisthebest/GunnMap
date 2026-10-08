export const RENDER_TIMEOUT_MS = 60_000;

// Bound the whole request, including response parsing and image decoding.
// Racing the signal also releases the UI if an underlying operation ignores it.
export async function runRenderRequest<T>(
  controller: AbortController,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const { signal } = controller;
  signal.throwIfAborted();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Map generation took too long. Please try again.", "TimeoutError"));
  }, RENDER_TIMEOUT_MS);
  let abort!: () => void;
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      void work(signal).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

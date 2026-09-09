export type RequestTimeout = {
  controller: AbortController;
  clear: () => void;
};

/** AbortController timer kept framework-free so transport behavior is testable. */
export function createRequestTimeout(timeoutMs: number): RequestTimeout {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

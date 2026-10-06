/** Each effect owns its request; cleanup also invalidates in-flight responses. */
export function scheduleCatalogSearch<T>(
  load: () => Promise<T>,
  success: (result: T) => void,
  failure: () => void,
  settled: () => void,
  delay = 500,
): () => void {
  let active = true;
  const timer = setTimeout(() => {
    void load().then(
      result => { if (active) success(result); },
      () => { if (active) failure(); },
    ).finally(() => { if (active) settled(); });
  }, delay);
  return () => { active = false; clearTimeout(timer); };
}

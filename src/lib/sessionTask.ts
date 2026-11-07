/** Drop asynchronous account results and failures after sign-out, account changes,
 * or subscription cleanup. Callers provide both epoch and disposal checks. */
export async function runSessionTask<T>(
  current: () => boolean,
  read: () => Promise<T>,
  accept: (value: T) => void,
  reject: (error: unknown) => void = () => {},
): Promise<void> {
  if (!current()) return;
  try {
    const value = await read();
    if (current()) accept(value);
  } catch (error) {
    if (current()) reject(error);
  }
}

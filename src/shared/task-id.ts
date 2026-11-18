export function isSafeTaskId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(value);
}

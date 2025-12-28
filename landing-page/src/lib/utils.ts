export function cn(...inputs: Array<string | undefined | null | false>) {
  return inputs
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}

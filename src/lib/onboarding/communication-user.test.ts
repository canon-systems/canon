import { describe, expect, it } from 'vitest';
import { resolvedCommunicationEmail } from './communication-user';

describe('resolvedCommunicationEmail', () => {
  it('uses the email supplied by the connected communication account', () => {
    expect(resolvedCommunicationEmail({ email: ' alex@example.com ' }, '')).toBe('alex@example.com');
  });

  it('uses the manually entered email when the connected account has none', () => {
    expect(resolvedCommunicationEmail({ email: null }, ' alex@example.com ')).toBe('alex@example.com');
  });
});

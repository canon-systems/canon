export const DEFAULT_AUDIENCES = [
  'Executive',
  'Sales',
  'Marketing',
  'Engineering',
  'Support',
  'Customer',
] as const;

export type Audience = (typeof DEFAULT_AUDIENCES)[number];

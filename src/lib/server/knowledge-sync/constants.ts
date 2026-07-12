export type SyncableSourceStatus = 'pending' | 'syncing' | 'active';

export const SYNCABLE_SOURCE_STATUSES = new Set<SyncableSourceStatus>(['pending', 'syncing', 'active']);

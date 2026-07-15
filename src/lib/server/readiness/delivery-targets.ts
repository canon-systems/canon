import type { ReadinessDeliveryProvider, ReadinessDeliveryTargetType } from '@/types/onboarding';

export type NormalizedReadinessDeliveryTarget = {
  provider: ReadinessDeliveryProvider;
  targetType: ReadinessDeliveryTargetType;
  targetId: string;
  targetName: string | null;
  enabled: boolean;
};

export type ReadinessDeliveryTargetRowInput = {
  organization_id: string;
  provider: ReadinessDeliveryProvider;
  target_type: ReadinessDeliveryTargetType;
  target_id: string;
  target_name: string | null;
  enabled: boolean;
};

type DeliveryTargetInput = {
  provider?: unknown;
  targetType?: unknown;
  target_type?: unknown;
  targetId?: unknown;
  target_id?: unknown;
  targetName?: unknown;
  target_name?: unknown;
  enabled?: unknown;
};

export function validSlackChannelIds(values: unknown): string[] {
  return Array.isArray(values)
    ? values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
        .filter((value) => /^[CG][A-Z0-9]+$/.test(value))
    : [];
}

export function validSlackDmTargets(values: unknown): string[] {
  return Array.isArray(values)
    ? values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
        .filter((value) => value !== 'USLACKBOT')
        .filter((value) => /^[DU][A-Z0-9]+$/.test(value))
    : [];
}

export function isReadinessDeliveryProvider(value: unknown): value is ReadinessDeliveryProvider {
  return value === 'slack' || value === 'teams';
}

function isReadinessDeliveryTargetType(value: unknown): value is ReadinessDeliveryTargetType {
  return value === 'channel' || value === 'dm';
}

export function validDeliveryTargets(values: unknown): NormalizedReadinessDeliveryTarget[] {
  if (!Array.isArray(values)) return [];

  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const target = value as DeliveryTargetInput;
    const targetType = target.targetType ?? target.target_type;
    const targetId = target.targetId ?? target.target_id;
    const targetName = target.targetName ?? target.target_name;

    if (!isReadinessDeliveryProvider(target.provider) || !isReadinessDeliveryTargetType(targetType)) return [];
    if (typeof targetId !== 'string' || targetId.trim().length === 0) return [];

    return [{
      provider: target.provider,
      targetType,
      targetId: targetId.trim(),
      targetName: typeof targetName === 'string' && targetName.trim().length > 0 ? targetName.trim() : null,
      enabled: target.enabled !== false,
    }];
  });
}

export function deliveryTargetRows(
  values: unknown,
  organizationId: string
): ReadinessDeliveryTargetRowInput[] {
  return validDeliveryTargets(values).map((target) => ({
    organization_id: organizationId,
    provider: target.provider,
    target_type: target.targetType,
    target_id: target.targetId,
    target_name: target.targetName,
    enabled: target.enabled,
  }));
}

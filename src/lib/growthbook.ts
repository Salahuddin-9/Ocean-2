/**
 * Ocean — GrowthBook SDK integration (feature #259)
 * --------------------------------------------------
 * Feature flags + A/B experiments through the GrowthBook JS SDK
 * (@growthbook/growthbook + @growthbook/growthbook-react).
 *
 * Flags configured in the Ocean OS Layer admin panel (turtleOSLayerBackend)
 * are synced into the GrowthBook client as local features, so the real SDK
 * evaluates them with rollout %, groups and overrides — no heavy custom code.
 * A hosted GrowthBook account (VITE_GROWTHBOOK_CLIENT_KEY / VITE_GROWTHBOOK_API_HOST)
 * can replace the local feature source transparently.
 */
import { GrowthBook } from '@growthbook/growthbook';
import { GrowthBookProvider, useFeature, useFeatureIsOn, useGrowthBook } from '@growthbook/growthbook-react';

export const growthbook = new GrowthBook({
  apiHost: (import.meta as any).env?.VITE_GROWTHBOOK_API_HOST || 'https://cdn.growthbook.io',
  clientKey: (import.meta as any).env?.VITE_GROWTHBOOK_CLIENT_KEY || 'sdk-ocean-local',
  enableDevMode: true,
});

export { GrowthBookProvider, useFeature, useFeatureIsOn, useGrowthBook };

/** Feature hook with a boolean fallback (flag `on` state). */
export function useOceanFlag(key: string, fallback = false): boolean {
  const on = useFeatureIsOn(key);
  const { value } = useFeature(key);
  if (typeof on === 'boolean') return on;
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Push flags from the Ocean OS Layer API (/api/os/flags/evaluate) into the
 * GrowthBook client. Each feature is registered with its evaluated `on` state
 * as the defaultValue, so the SDK's feature model matches the admin panel.
 */
export function syncFlagsFromOS(flags: { id: string; on: boolean }[]): void {
  const features: Record<string, unknown> = {};
  for (const f of flags) {
    features[f.id] = { defaultValue: f.on };
  }
  growthbook.setFeatures(features);
}

/** Identify the current user so experiments bucket deterministically. */
export function identifyGBUser(id: string | undefined | null): void {
  if (id) growthbook.setAttributes({ id });
}

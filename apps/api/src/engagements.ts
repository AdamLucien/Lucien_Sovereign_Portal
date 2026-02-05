export const TIER_ENGAGEMENT_MAP = {
  0: ['TIER-DIAGNOSIS'],
  1: ['TIER-ARCHITECT'],
  2: ['TIER-SOVEREIGN'],
} as const;

const ALL_ENGAGEMENT_IDS = new Set(Object.values(TIER_ENGAGEMENT_MAP).flat());

export const isValidEngagementId = (value: string) => ALL_ENGAGEMENT_IDS.has(value);

export const normalizeEngagementIds = (values: string[]) => {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
};

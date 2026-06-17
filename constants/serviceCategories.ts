/**
 * The 8 maritime service categories. `name` and `iconName` mirror the
 * service_categories seed data; the canonical source of truth is the DB row
 * (matched by `name`). Icons are Ionicons (Expo vector icons) names.
 */
export type ServiceCategoryDef = {
  name: string;
  iconName: string;
  requiresPortAuthorityApproval: boolean;
  defaultUnit: string;
};

export const SERVICE_CATEGORIES: ServiceCategoryDef[] = [
  { name: 'Bunkering', iconName: 'flame', requiresPortAuthorityApproval: true, defaultUnit: 'MT' },
  { name: 'De-bunkering', iconName: 'flame-outline', requiresPortAuthorityApproval: true, defaultUnit: 'MT' },
  { name: 'Food & Provisions', iconName: 'restaurant', requiresPortAuthorityApproval: false, defaultUnit: 'kg' },
  { name: 'Medical Services', iconName: 'medical', requiresPortAuthorityApproval: false, defaultUnit: 'units' },
  { name: 'Crew Exchange', iconName: 'people', requiresPortAuthorityApproval: false, defaultUnit: 'persons' },
  { name: 'Fresh Water Supply', iconName: 'water', requiresPortAuthorityApproval: true, defaultUnit: 'MT' },
  { name: 'Waste Disposal', iconName: 'trash', requiresPortAuthorityApproval: true, defaultUnit: 'm³' },
  { name: 'Sludge Removal', iconName: 'construct', requiresPortAuthorityApproval: true, defaultUnit: 'm³' },
];

export const COMMON_UNITS = ['MT', 'litres', 'm³', 'kg', 'persons', 'units', 'pallets'] as const;

export function serviceIconFor(name: string): string {
  return SERVICE_CATEGORIES.find((c) => c.name === name)?.iconName ?? 'cube';
}

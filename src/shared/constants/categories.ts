import type { WorkCategory } from '../types';

export const WORK_CATEGORIES: { id: WorkCategory; label: string }[] = [
  { id: 'study', label: 'Study' },
  { id: 'coding', label: 'Coding' },
  { id: 'business', label: 'Business' },
  { id: 'office', label: 'Office work' },
  { id: 'freelance', label: 'Freelancing' },
  { id: 'creative', label: 'Creative work' },
  { id: 'reading', label: 'Reading' },
  { id: 'writing', label: 'Writing' },
  { id: 'learning', label: 'Learning' },
  { id: 'other', label: 'Other' },
];

export const CATEGORY_IDS = WORK_CATEGORIES.map((c) => c.id);

export function categoryLabel(id: WorkCategory): string {
  return WORK_CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
}

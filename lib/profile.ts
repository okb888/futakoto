import type { UserProfile } from './db';

/** パートナーの表示名を一意に決める。displayName → email ローカル部 → 'パートナー'。 */
export function getPartnerDisplayName(profile: UserProfile | null | undefined): string {
  if (!profile) return 'パートナー';
  if (profile.displayName && profile.displayName.trim().length > 0) return profile.displayName;
  if (profile.email) {
    const local = profile.email.split('@')[0];
    if (local) return local;
  }
  return 'パートナー';
}

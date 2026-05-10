import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { getUserProfile, type UserProfile } from '../lib/db';

export function useSettingsProfile() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);

  // refreshProfile は useAuth 側で毎レンダー再生成される可能性があるため ref で保持
  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  const load = useCallback(async (
    isCancelled: () => boolean = () => false,
    profileOverride?: UserProfile | null
  ): Promise<UserProfile | null> => {
    if (!user) return null;
    const p = profileOverride
      ?? await getUserProfile(user.uid)
      ?? authProfile
      ?? await refreshProfileRef.current();
    if (isCancelled() || !p) return null;
    setProfile(p);
    if (p.partnerUid) {
      const pp = await getUserProfile(p.partnerUid);
      if (!isCancelled()) setPartnerProfile(pp ?? null);
    } else {
      setPartnerProfile(null);
    }
    return p;
  }, [user?.uid, authProfile?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]));

  return { profile, setProfile, partnerProfile, load };
}

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@/types/database';

export type AuthStatus = 'loading' | 'authed' | 'unverified' | 'anon';

function deriveStatus(session: Session | null, profile: Profile | null): AuthStatus {
  if (!session) return 'anon';
  if (!profile) return 'loading';
  return profile.verified ? 'authed' : 'unverified';
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  status: AuthStatus;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  profile: null,
  status: 'anon',
  setSession: (session) =>
    set((state) => ({
      session,
      status: deriveStatus(session, state.profile),
    })),
  setProfile: (profile) =>
    set((state) => ({
      profile,
      status: deriveStatus(state.session, profile),
    })),
  reset: () => set({ session: null, profile: null, status: 'anon' }),
}));

/** Non-hook getter for use outside React (e.g. in query fns, listeners). */
export const getAuthState = useAuthStore.getState;

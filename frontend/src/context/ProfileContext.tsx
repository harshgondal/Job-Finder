import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

export interface ResumeMeta {
  filename: string;
  originalName?: string;
  uploadedAt?: string;
}

export interface Profile {
  profile_id?: string;
  name?: string;
  skills: string[];
  experience_years: number;
  roles: string[];
  domains: string[];
  preferred_locations: string[];
  interests?: string[];
  education_level?: string;
  projects?: string[];
  inferred_preferences?: {
    company_size?: string;
    work_mode_preference?: string;
    focus_area?: string;
  };
}

export interface RefinementQuestion {
  id: string;
  prompt: string;
  type: 'single-select' | 'multi-select' | 'text';
  options?: { value: string; label: string }[];
  optional?: boolean;
  helperText?: string;
}

interface ProfileContextValue {
  profile: Profile | null;
  profileId: string | null;
  refinementQuestions: RefinementQuestion[];
  refinementContext: string;
  resume: ResumeMeta | null;
  loading: boolean;
  interests: string;
  preferences: any;
  setProfile: (profile: Profile | null) => void;
  setProfileId: (id: string | null) => void;
  setRefinementQuestions: (questions: RefinementQuestion[]) => void;
  setRefinementContext: (context: string) => void;
  setResume: (resume: ResumeMeta | null) => void;
  setInterests: (interests: string) => void;
  setPreferences: (prefs: any) => void;
  refreshProfile: () => Promise<void>;
  clearProfile: () => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [refinementQuestions, setRefinementQuestions] = useState<RefinementQuestion[]>([]);
  const [refinementContext, setRefinementContext] = useState<string>('');
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [interests, setInterests] = useState<string>('');
  const [preferences, setPreferences] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(false);
  const { user, loading: authLoading } = useAuth();

  const clearProfile = useCallback(() => {
    setProfile(null);
    setProfileId(null);
    setRefinementQuestions([]);
    setRefinementContext('');
    setResume(null);
    setInterests('');
    setPreferences({});
  }, []);

  const refreshProfile = useCallback(async () => {
    if (authLoading || !user) {
      clearProfile();
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.get('/api/profile');
      setProfile(data.profile || null);
      setProfileId(data.profile_id || null);
      const questions = Array.isArray(data.refinement_questions?.questions)
        ? data.refinement_questions.questions.filter(
            (item: any) =>
              item &&
              typeof item.id === 'string' &&
              typeof item.prompt === 'string' &&
              typeof item.type === 'string'
          )
        : [];
      setRefinementQuestions(questions);
      setRefinementContext(data.refinement_questions?.context || '');
      setResume(data.resume || null);
      if (data.profile?.interests?.length) {
        setInterests(data.profile.interests.join(', '));
      }
      if (data.preferences) {
        setPreferences(data.preferences);
      } else {
        setPreferences({});
      }
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        clearProfile();
      } else if (status !== 401) {
        console.error('Failed to load stored profile:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, clearProfile]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      clearProfile();
      return;
    }

    refreshProfile();
  }, [authLoading, user, refreshProfile, clearProfile]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        profileId,
        refinementQuestions,
        refinementContext,
        resume,
        loading,
        interests,
        preferences,
        setProfile,
        setProfileId,
        setRefinementQuestions,
        setRefinementContext,
        setResume,
        setInterests,
        setPreferences,
        refreshProfile,
        clearProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}



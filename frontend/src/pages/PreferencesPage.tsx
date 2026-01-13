import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PreferenceRefinement from '../components/PreferenceRefinement';
import { useProfile } from '../context/ProfileContext';

function PreferencesPage() {
  const {
    profile,
    profileId,
    refinementQuestions,
    refinementContext,
    interests,
    setProfile,
    setInterests,
    preferences,
    setPreferences,
  } = useProfile();
  const [savingInterests, setSavingInterests] = useState(false);
  const navigate = useNavigate();

  // const handleProfileRefined = (refinedProfile: any) => {
  //   if (refinedProfile) {
  //     setProfile(refinedProfile);
  //     setInterests((refinedProfile.interests || []).join(', '));
  //   }
  // };

  const saveInterests = async () => {
    if (!profileId) {
      alert('Upload a resume first to attach interests to your profile.');
      return;
    }
    setSavingInterests(true);
    try {
      const { data } = await axios.post('/api/profile/refine', {
        profile_id: profileId,
        interests,
        answers: {},
      });
      setProfile(data.profile);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save interests');
    } finally {
      setSavingInterests(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-intro" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
        <p className="eyebrow">Step 2</p>
        <h1 className="page-title" style={{ fontSize: '2.4rem' }}>Preferences &amp; Interests</h1>
        <p className="page-subtitle" style={{ textAlign: 'left' }}>
          Refine your job preferences and interests to get better matches.
        </p>
      </header>

      <div className="page-stack">
        {refinementQuestions.length > 0 && (
          <section className="section-card">
            <h2 className="section-title">Refine your preferences</h2>
            <p className="section-subtitle">
              Answer a few quick questions so we can tailor recommendations with more confidence.
            </p>
            <PreferenceRefinement
              profileId={profile?.profile_id || profileId || undefined}
              questions={refinementQuestions}
              context={refinementContext}
              // onRefined={handleProfileRefined}
              initialProfile={profile}
              initialPreferences={preferences}
              onPreferencesSaved={setPreferences}
            />
          </section>
        )}

        <section className="section-card">
          <h2 className="section-title">Interests</h2>
          <p className="section-subtitle">
            Add or edit your interests to help us surface roles that match your energy.
          </p>
          <textarea
            className="input"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="e.g., AI, fintech, remote-first, fast-growing startups"
            style={{ minHeight: 120, width: '100%' }}
          />
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="button" onClick={saveInterests} disabled={savingInterests || !profileId}>
              {savingInterests ? 'Saving…' : 'Save interests'}
            </button>
            {!profileId && (
              <p className="muted-text small">
                Upload a resume first to persist your interests.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="button-row" style={{ justifyContent: 'flex-end' }}>
        <button className="button" onClick={() => navigate('/search')}>
          Next
        </button>
      </div>
    </div>
  );
}

export default PreferencesPage;



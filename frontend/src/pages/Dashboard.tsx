import { useMemo, useRef, useState, useEffect } from 'react';
import ResumeUpload from '../components/ResumeUpload';
import PreferenceRefinement from '../components/PreferenceRefinement';
import JobSearch from '../components/JobSearch';
import JobList from '../components/JobList';
import CompanyResearch from '../components/CompanyResearch';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import axios from 'axios';

interface Profile {
  profile_id?: string;
  name?: string;
  skills: string[];
  experience_years: number;
  roles: string[];
  domains: string[];
  preferred_locations: string[];
  interests?: string[];
  education_level?: string;
  inferred_preferences?: {
    company_size?: string;
    work_mode_preference?: string;
    focus_area?: string;
  };
}

const PAGE_SIZE = 6;

function Dashboard() {
  const { user, logout } = useAuth();
  const {
    profile,
    profileId,
    refinementQuestions,
    refinementContext,
    interests,
    setProfile,
    setInterests,
    resume,
  } = useProfile();
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsMeta, setJobsMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [recommended, setRecommended] = useState<{ roles: string[]; locations: string[] }>({ roles: [], locations: [] });
  const [savingInterests, setSavingInterests] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleProfileRefined = (refinedProfile: Profile) => {
    setProfile(refinedProfile);
    setInterests((refinedProfile.interests || []).join(', '));
  };

  const handleJobsFound = (foundJobs: any[], meta?: any, searchRole?: string, searchLocation?: string) => {
    setJobs(foundJobs);
    setJobsMeta(meta || null);
    setPage(1);

    const roleSuggestions: string[] = [];
    const locSuggestions: string[] = [];

    if (meta?.agent?.queryPlan && searchRole && meta.agent.queryPlan.toLowerCase() !== searchRole.toLowerCase()) {
      roleSuggestions.push(meta.agent.queryPlan);
    }

    if (searchLocation) {
      const loc = searchLocation.toLowerCase();
      if (loc.includes('us') || loc.includes('america') || loc.includes('united states')) {
        locSuggestions.push('New York', 'California', 'Texas', 'Remote');
      } else if (loc.includes('india')) {
        locSuggestions.push('Bangalore', 'Hyderabad', 'Pune', 'Remote');
      }
    }

    setRecommended({
      roles: roleSuggestions,
      locations: locSuggestions,
    });
  };

  const saveInterests = async () => {
    if (!profileId) {
      alert('Upload a resume to attach interests to your profile.');
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

  const paginatedJobs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return jobs.slice(start, start + PAGE_SIZE);
  }, [jobs, page]);

  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));

  useEffect(() => {
    if (profile && profile.interests && profile.interests.length > 0) {
      setInterests((profile.interests || []).join(', '));
    }
  }, [profile, setInterests]);

  return (
    <div className="page">
      <Navbar />
      <header className="topbar dash">
        <div>
          <p className="eyebrow">Job Application Finder</p>
          <h1>Welcome, {user?.name || 'Candidate'}</h1>
          <p className="subtitle">
            Upload a resume (optional), manage interests, and search curated jobs. Redirects always land on the source site.
          </p>
          <div className="pill-row">
            <span className="pill subtle">Authenticated access</span>
            <span className="pill subtle">Profile dropdown</span>
            <span className="pill subtle">Logout & update profile</span>
          </div>
        </div>
        <button className="button ghost" onClick={logout}>Logout</button>
      </header>

      <main className="layout">
        <section className="sidebar" ref={profileRef}>
          <ResumeUpload />

          <div className="card muted">
            <h3 className="card-title">Profile snapshot</h3>
            {!profile && (
              <p className="muted-text">
                Upload a resume to unlock personalized matches. You can still search without it.
              </p>
            )}
            {profile && (
              <div className="profile-grid">
                {resume && (
                  <div>
                    <p className="label">Resume</p>
                    <p>{resume.originalName || resume.filename}</p>
                  </div>
                )}
                <div>
                  <p className="label">Name</p>
                  <p>{profile.name || 'Not provided'}</p>
                </div>
                <div>
                  <p className="label">Experience</p>
                  <p>{profile.experience_years} yrs</p>
                </div>
                <div>
                  <p className="label">Roles</p>
                  <p>{profile.roles.join(', ') || 'None'}</p>
                </div>
                <div>
                  <p className="label">Locations</p>
                  <p>{profile.preferred_locations.join(', ') || 'None'}</p>
                </div>
                <div>
                  <p className="label">Skills</p>
                  <p>{profile.skills.join(', ') || 'Not detected'}</p>
                </div>
              </div>
            )}
          </div>

          {profile && refinementQuestions.length > 0 && (
            <PreferenceRefinement
              profileId={profile.profile_id!}
              questions={refinementQuestions}
              context={refinementContext}
              onRefined={handleProfileRefined}
            />
          )}

          <div className="card">
            <p className="eyebrow">Interests</p>
            <h3 className="card-title">Add/edit interests</h3>
            <textarea
              className="input"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="e.g., AI, fintech, remote-first, fast-growing startups"
              style={{ minHeight: 80 }}
            />
            <button className="button" onClick={saveInterests} disabled={savingInterests}>
              {savingInterests ? 'Saving...' : 'Save interests'}
            </button>
          </div>
        </section>

        <section className="content">
          <JobSearch
            profileId={profile?.profile_id}
            onJobsFound={handleJobsFound}
            loading={loading}
            setLoading={setLoading}
          />

          {jobsMeta && (
            <div className="card info">
              <div>
                <p className="label">Results</p>
                <p className="stat">{jobsMeta?.total || jobs.length} jobs</p>
              </div>
              <div>
                <p className="label">Query plan</p>
                <p>{jobsMeta?.agent?.queryPlan || 'Direct role match'}</p>
              </div>
              <div>
                <p className="label">Matched</p>
                <p>{jobsMeta?.matched ? 'Profile-aware' : 'Basic search'}</p>
              </div>
            </div>
          )}

          {jobs.length === 0 && (
            <div className="card muted">
              <h3 className="card-title">No exact matches yet</h3>
              <p className="muted-text">
                Try adjusting the role or location. We will also look for nearby cities and related titles automatically.
              </p>
              {(recommended.roles.length > 0 || recommended.locations.length > 0) && (
                <div className="pill-row">
                  {recommended.roles.map((r) => (
                    <span key={r} className="pill">Try role: {r}</span>
                  ))}
                  {recommended.locations.map((l) => (
                    <span key={l} className="pill">Nearby: {l}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {jobs.length > 0 && (
            <>
              <JobList
                jobs={paginatedJobs}
                onCompanyClick={setSelectedCompany}
              />

              <div className="pagination">
                <button
                  className="button ghost"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Prev
                </button>
                <span className="muted-text">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="button ghost"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            </>
          )}

          {selectedCompany && (
            <CompanyResearch
              company={selectedCompany}
              profileId={profile?.profile_id || ''}
              onClose={() => setSelectedCompany(null)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;





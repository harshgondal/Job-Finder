import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import JobSearch from '../components/JobSearch';
import JobList from '../components/JobList';
import CompanyResearch from '../components/CompanyResearch';
import { useProfile } from '../context/ProfileContext';

// Server-side pagination (fixed 5 per page)

function SearchPage() {
  const { profile } = useProfile();
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsMeta, setJobsMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [lastRole, setLastRole] = useState<string>('');
  const [lastLocation, setLastLocation] = useState<string>('');
  const [recommended, setRecommended] = useState<{ roles: string[]; locations: string[] }>({
    roles: [],
    locations: [],
  });
  const [lastPreference, setLastPreference] = useState<string>('');
  const [searchRole, setSearchRole] = useState<string>('');
  const [searchLocation, setSearchLocation] = useState<string>('');
  const [searchPreferences, setSearchPreferences] = useState<string>('');
  const matchPollRef = useRef<number | null>(null);

  const storageKey = profile?.profile_id
    ? `job-search:last:${profile.profile_id}`
    : 'job-search:last:anonymous';

  const persistState = useCallback(
    (updates: Record<string, unknown>) => {
      if (typeof window === 'undefined') return;
      try {
        const existingRaw = window.localStorage.getItem(storageKey);
        const existing = existingRaw ? JSON.parse(existingRaw) : {};
        const next = { ...existing, ...updates };
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to persist job search state', error);
      }
    },
    [storageKey]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedRaw = window.localStorage.getItem(storageKey);
      if (!storedRaw) {
        setJobs([]);
        setJobsMeta(null);
        setPage(1);
        setLastRole('');
        setLastLocation('');
        setLastPreference('');
        setSearchRole('');
        setSearchLocation('');
        setSearchPreferences('');
        return;
      }

      const stored = JSON.parse(storedRaw);
      if (stored.role) {
        setSearchRole(stored.role);
        setLastRole(stored.role);
      }
      if (stored.location) {
        setSearchLocation(stored.location);
        setLastLocation(stored.location);
      } else {
        setSearchLocation('');
        setLastLocation('');
      }
      if (stored.preferences) {
        setSearchPreferences(stored.preferences);
        setLastPreference(stored.preferences);
      } else {
        setSearchPreferences('');
        setLastPreference('');
      }
      if (Array.isArray(stored.jobs)) {
        setJobs(stored.jobs);
      } else {
        setJobs([]);
      }
      if (stored.meta) {
        setJobsMeta(stored.meta);
        setPage(stored.meta?.page || 1);
      } else {
        setJobsMeta(null);
        setPage(1);
      }
    } catch (error) {
      console.warn('Failed to load last job search from storage', error);
    }
  }, [storageKey]);

  useEffect(() => {
    persistState({
      role: searchRole,
      location: searchLocation,
      preferences: searchPreferences,
    });
  }, [searchRole, searchLocation, searchPreferences, persistState]);

  const handleJobsFound = (
    foundJobs: any[],
    meta?: any,
    searchRole?: string,
    searchLocation?: string,
    preferenceNotes?: string,
  ) => {
    setJobs(foundJobs);
    setJobsMeta(meta || null);
    setPage(meta?.page || 1);
    setLastRole(searchRole || '');
    setLastLocation(searchLocation || '');
    setLastPreference(preferenceNotes || '');
    if (typeof searchRole === 'string') {
      setSearchRole(searchRole);
    }
    if (typeof searchLocation === 'string') {
      setSearchLocation(searchLocation);
    }
    if (typeof preferenceNotes === 'string') {
      setSearchPreferences(preferenceNotes);
    }

    const roleSuggestions: string[] = [];
    const locSuggestions: string[] = (meta?.suggestions || []).slice(0, 5);

    if (meta?.agent?.queryPlan && searchRole && meta.agent.queryPlan.toLowerCase() !== searchRole.toLowerCase()) {
      roleSuggestions.push(meta.agent.queryPlan);
    }

    setRecommended({
      roles: roleSuggestions,
      locations: locSuggestions,
    });

    persistState({
      jobs: foundJobs,
      meta: meta || null,
      role: searchRole || '',
      location: searchLocation || '',
      preferences: preferenceNotes || '',
      timestamp: Date.now(),
    });
  };

  const totalPages = Math.max(
    1,
    jobsMeta?.totalPages ||
      (jobsMeta?.total ? Math.ceil(jobsMeta.total / (jobsMeta?.pageSize || 5)) : 1)
  );

  const fetchPage = useCallback(async (nextPage: number) => {
    if (!lastRole) return;
    setLoading(true);
    try {
      const { data } = await axios.post('/api/jobs/search', {
        role: lastRole,
        location: lastLocation || undefined,
        page: nextPage,
        profile_id: profile?.profile_id,
        preference_notes: lastPreference || undefined,
      });
      setJobs(data.data || []);
      setJobsMeta(data.meta || null);
      setPage(data?.meta?.page || nextPage);
      persistState({
        jobs: data.data || [],
        meta: data.meta || null,
        role: lastRole,
        location: lastLocation,
        preferences: lastPreference,
        timestamp: Date.now(),
      });
    } catch (e: any) {
      console.error('Pagination fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [lastRole, lastLocation, lastPreference, profile?.profile_id]);

  useEffect(() => {
    const clearPoll = () => {
      if (matchPollRef.current !== null) {
        window.clearInterval(matchPollRef.current);
        matchPollRef.current = null;
      }
    };

    const pendingKeys = jobs
      .map((job) =>
        job?.matchCacheKey && job?.match?.status === 'pending' ? String(job.matchCacheKey) : null
      )
      .filter((key): key is string => Boolean(key));

    if (pendingKeys.length === 0) {
      clearPoll();
      return undefined;
    }

    const fetchStatuses = async () => {
      try {
        const { data } = await axios.get('/api/jobs/match-status', {
          params: { keys: pendingKeys.join(',') },
        });
        const results = data?.results || {};

        if (Object.keys(results).length === 0) {
          return;
        }

        setJobs((prevJobs) => {
          let changed = false;
          const nextJobs = prevJobs.map((job) => {
            const matchKey = typeof job?.matchCacheKey === 'string' ? job.matchCacheKey : null;
            if (!matchKey) return job;
            const payload = results[matchKey];
            if (!payload) return job;
            const existing = job.match || null;
            if (existing && JSON.stringify(existing) === JSON.stringify(payload)) {
              return job;
            }
            changed = true;
            return {
              ...job,
              match: payload,
            };
          });

          return changed ? nextJobs : prevJobs;
        });
      } catch (error) {
        console.warn('Match status polling failed:', error);
      }
    };

    fetchStatuses();
    matchPollRef.current = window.setInterval(fetchStatuses, 3500);

    return () => {
      clearPoll();
    };
  }, [jobs]);


  return (
    <div className="page-container">
      <header className="page-intro" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
        <p className="eyebrow">Step 3</p>
        <h1 className="page-title" style={{ fontSize: '2.4rem' }}>Job Search &amp; Results</h1>
        <p className="page-subtitle" style={{ textAlign: 'left' }}>
          Search for jobs across multiple sources. Results include match explanations and source links.
        </p>
      </header>

      <div className="page-stack">
        <section className="section-card">
          <JobSearch
            profileId={profile?.profile_id}
            onJobsFound={handleJobsFound}
            loading={loading}
            setLoading={setLoading}
            role={searchRole}
            location={searchLocation}
            preferences={searchPreferences}
            onRoleChange={setSearchRole}
            onLocationChange={setSearchLocation}
            onPreferencesChange={setSearchPreferences}
          />
        </section>

        {jobsMeta && (
          <section className="section-card">
            <h2 className="section-title">Search summary</h2>
            <div className="meta-row">
              <div>
                <p className="label">Results</p>
                <p className="stat">{jobsMeta?.total ?? jobs.length}</p>
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
          </section>
        )}

        {jobs.length === 0 && (
          <section className="section-card empty-state">
            <h2 className="section-title">No exact matches yet</h2>
            <p className="muted-text">
              Try adjusting the role or location. We will also look for nearby cities and related titles automatically.
            </p>
            {(recommended.roles.length > 0 || recommended.locations.length > 0) && (
              <div className="tag-cloud" style={{ justifyContent: 'center' }}>
                {recommended.roles.map((r) => (
                  <span key={r} className="pill">
                    Try role: {r}
                  </span>
                ))}
                {recommended.locations.map((l) => (
                  <span key={l} className="pill">
                    Nearby: {l}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {jobs.length > 0 && (
          <section className="section-card">
            <header className="card-header" style={{ marginBottom: 20 }}>
              <div>
                <p className="eyebrow">Matches</p>
                <h2 className="section-title" style={{ marginBottom: 0 }}>
                  Job matches ({jobsMeta?.total ?? jobs.length})
                </h2>
              </div>
            </header>

            <div className="page-stack">
              <JobList jobs={jobs} onCompanyClick={setSelectedCompany} />

              <div className="form-actions" style={{ justifyContent: 'center' }}>
                <button
                  className="button ghost"
                  onClick={() => fetchPage(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                >
                  Prev
                </button>
                <span className="muted-text">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="button ghost"
                  onClick={() => fetchPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages || loading}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {selectedCompany && (
          <CompanyResearch
            company={selectedCompany}
            profileId={profile?.profile_id || ''}
            onClose={() => setSelectedCompany(null)}
          />
        )}
      </div>
    </div>
  );
}

export default SearchPage;



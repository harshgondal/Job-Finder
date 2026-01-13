import axios from 'axios';

interface JobSearchProps {
  profileId?: string;
  onJobsFound: (jobs: any[], meta?: any, role?: string, location?: string, preferenceNotes?: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  role: string;
  location: string;
  preferences: string;
  onRoleChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onPreferencesChange: (value: string) => void;
}

function JobSearch({
  profileId,
  onJobsFound,
  loading,
  setLoading,
  role,
  location,
  preferences,
  onRoleChange,
  onLocationChange,
  onPreferencesChange,
}: JobSearchProps) {
  
  const handleSearch = async () => {
    const trimmedRole = role.trim();
    if (!trimmedRole) {
      alert('Please enter a job role');
      return;
    }

    setLoading(true);
    try {
      const trimmedLocation = location.trim();
      const response = await axios.post('/api/jobs/search', {
        role: trimmedRole,
        location: trimmedLocation || undefined,
        profile_id: profileId,
        preference_notes: preferences || undefined,
      });
      onJobsFound(
        response.data.data || [],
        response.data.meta,
        trimmedRole,
        trimmedLocation,
        preferences,
      );
    } catch (error: any) {
      console.error('Search failed:', error);
      alert(error.response?.data?.error || 'Failed to search jobs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Search</p>
          <h2>Find your next role</h2>
        </div>
        <span className="pill subtle">Resume optional</span>
      </div>

      <div className="grid two">
        <div>
        <label className="label">Job Role *</label>
        <input
          type="text"
          className="input"
          placeholder="e.g., Software Engineer, Backend Developer"
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
        />
      </div>
        <div>
        <label className="label">Location (optional)</label>
        <input
          type="text"
          className="input"
            placeholder="e.g., Remote, India, New York"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
        />
        </div>
      </div>

      <label className="label">Preferences (optional)</label>
      <input
        type="text"
        className="input"
        placeholder="Preferred domain, work mode, company size..."
        value={preferences}
        onChange={(e) => onPreferencesChange(e.target.value)}
      />
      <div className="hint">
        <p className="muted-text">
          We will recommend nearby cities and similar roles if exact matches are limited.
        </p>
      </div>
      
      <div className="actions">
      <button
        className="button"
        onClick={handleSearch}
        disabled={loading || !role.trim()}
      >
        {loading ? 'Searching...' : 'Search Jobs'}
      </button>
        <p className="muted-text small">
          Case-insensitive search; sources include LinkedIn, Naukri, Wellfound.
        </p>
      </div>
    </div>
  );
}

export default JobSearch;



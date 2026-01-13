import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface PreferenceOption {
  value: string;
  label: string;
}

interface RefinementQuestion {
  id: string;
  prompt: string;
  type: 'single-select' | 'multi-select' | 'text';
  options?: PreferenceOption[];
  optional?: boolean;
  helperText?: string;
}

interface PreferenceRefinementProps {
  profileId?: string;
  questions: RefinementQuestion[];
  context?: string;
  initialProfile?: any;
  initialPreferences?: any;
  onPreferencesSaved?: (preferences: any) => void;
}

function PreferenceRefinement({
  profileId,
  questions,
  context,
  initialPreferences,
  onPreferencesSaved,
}: PreferenceRefinementProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const chipStyle = (selected: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid',
    borderColor: selected ? 'rgba(99, 102, 241, 0.8)' : 'rgba(148, 163, 184, 0.4)',
    background: selected ? 'linear-gradient(120deg, rgba(99,102,241,0.25), rgba(59,130,246,0.25))' : 'rgba(15, 23, 42, 0.4)',
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: '0.015em',
    transition: 'all 0.18s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    boxShadow: selected ? '0 0 0 2px rgba(99, 102, 241, 0.15)' : 'none',
  });

  const sectionCardStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.95), rgba(15, 23, 42, 0.85))',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: 18,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  };

  const questionTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#f8fafc',
    marginBottom: 6,
  };

  useEffect(() => {
    const nextAnswers: Record<string, string | string[]> = {};

    if (initialPreferences) {
      if (typeof initialPreferences.experienceLevel === 'string' && initialPreferences.experienceLevel.trim()) {
        nextAnswers.experience_level = initialPreferences.experienceLevel.trim();
      }

      if (Array.isArray(initialPreferences.workModes) && initialPreferences.workModes.length > 0) {
        nextAnswers.work_modes = initialPreferences.workModes;
      }

      if (Array.isArray(initialPreferences.employmentTypes) && initialPreferences.employmentTypes.length > 0) {
        nextAnswers.employment_types = initialPreferences.employmentTypes;
      }

      if (Array.isArray(initialPreferences.companySizes) && initialPreferences.companySizes.length > 0) {
        nextAnswers.company_sizes = initialPreferences.companySizes;
      }

      if (Array.isArray(initialPreferences.companyTypes) && initialPreferences.companyTypes.length > 0) {
        nextAnswers.company_types = initialPreferences.companyTypes;
      }

      if (Array.isArray(initialPreferences.includeCompanies) && initialPreferences.includeCompanies.length > 0) {
        nextAnswers.preferred_companies_include = initialPreferences.includeCompanies.join(', ');
      }

      if (Array.isArray(initialPreferences.excludeCompanies) && initialPreferences.excludeCompanies.length > 0) {
        nextAnswers.preferred_companies_exclude = initialPreferences.excludeCompanies.join(', ');
      }
    }

    setAnswers(nextAnswers);
    setError(null);
  }, [profileId, questions,  initialPreferences]);

  const handleSelectChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setError(null);
  };

  const handleMultiToggle = (questionId: string, optionValue: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const exists = current.includes(optionValue);
      const next = exists ? current.filter((item) => item !== optionValue) : [...current, optionValue];
      return { ...prev, [questionId]: next };
    });
    setError(null);
  };

  // const handleTextChange = (questionId: string, value: string) => {
  //   setAnswers((prev) => ({ ...prev, [questionId]: value }));
  //   setError(null);
  // };

  const payloadAnswers = useMemo(() => {
    const result: Record<string, string | string[]> = {};
    for (const question of questions) {
      const value = answers[question.id];
      if (value === undefined) continue;
      result[question.id] = value;
    }
    return result;
  }, [answers, questions]);

  const handleSubmit = async () => {
    if (questions.length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        answers: payloadAnswers,
      };
      if (profileId) {
        payload.profile_id = profileId;
      }
      const response = await axios.post('/api/profile/refine', payload);
      if (response.data?.preferences) {
        onPreferencesSaved?.(response.data.preferences);
      }
      setShowSuccess(true);
      setError(null);
    } catch (err) {
      console.error('Failed to refine preferences:', err);
      setError('We could not update your preferences. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setAnswers({});
    setShowSuccess(false);
    setError(null);
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    navigate('/preferences');
  };

  const experienceQuestion = questions.find((q) => q.id === 'experience_level');
  const workModeQuestion = questions.find((q) => q.id === 'work_modes');
  const employmentQuestion = questions.find((q) => q.id === 'employment_types');
  const companySizeQuestion = questions.find((q) => q.id === 'company_sizes');
  const companyTypeQuestion = questions.find((q) => q.id === 'company_types');
  const includeCompaniesQuestion = questions.find((q) => q.id === 'preferred_companies_include');
  const excludeCompaniesQuestion = questions.find((q) => q.id === 'preferred_companies_exclude');

  const renderSelectQuestion = (question?: RefinementQuestion) => {
    if (!question) return null;
    return (
      <div key={question.id}>
        <p style={questionTitleStyle}>{question.prompt}</p>
        <select
          className="input"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', borderColor: 'rgba(148,163,184,0.2)' }}
          value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
          onChange={(e) => handleSelectChange(question.id, e.target.value)}
        >
          <option value="">Select an option</option>
          {question.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderChipQuestion = (question?: RefinementQuestion) => {
    if (!question || !question.options) return null;
    const selected = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]) : [];

    return (
      <div key={question.id}>
        <p style={questionTitleStyle}>{question.prompt}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {question.options.map((option) => {
            const isActive = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                style={chipStyle(isActive)}
                onClick={() => handleMultiToggle(question.id, option.value)}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isActive ? 'rgba(96, 165, 250, 0.95)' : 'rgba(148, 163, 184, 0.45)',
                  }}
                />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTextQuestion = (question?: RefinementQuestion) => {
    if (!question) return null;
    return (
      <div key={question.id}>
        <p style={questionTitleStyle}>{question.prompt}</p>
        <input
          type="text"
          className="input"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', borderColor: 'rgba(148,163,184,0.2)' }}
          placeholder={question.helperText || 'Your answer...'}
          value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
          onChange={(e) => handleSelectChange(question.id, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div className="card">
      <h2>Refine Your Preferences</h2>
      <p style={{ marginBottom: '16px', color: '#666' }}>
        Sharpen your search filters with the options below. These map directly to job-board controls.
      </p>

      {(
        <div className="info-card" style={{ marginBottom: 16 }}>
          <p className="label" style={{ marginBottom: 6 }}>Why these questions?</p>
          <p className="muted-text small">{context}</p>
        </div>
      )}

      {questions.length === 0 && (
        <p className="muted-text small">
          You&apos;re all set. Upload a resume or refresh your profile to update these filters.
        </p>
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        <section style={sectionCardStyle}>
          <div>
            <p className="label" style={{ color: '#94a3b8', marginBottom: 4 }}>Role targeting</p>
            <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: 18 }}>Focus on fit</h3>
            <p className="muted-text small" style={{ marginTop: 6 }}>
              We’ll prioritise roles that meet your experience expectations, preferred working style, and employment type.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {renderSelectQuestion(experienceQuestion)}
            {renderChipQuestion(workModeQuestion)}
            {renderChipQuestion(employmentQuestion)}
          </div>
        </section>

        <section style={sectionCardStyle}>
          <div>
            <p className="label" style={{ color: '#94a3b8', marginBottom: 4 }}>Company signals</p>
            <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: 18 }}>Where you thrive</h3>
            <p className="muted-text small" style={{ marginTop: 6 }}>
              Highlight the environments and employers you’re excited about to tilt matches in that direction.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {renderChipQuestion(companySizeQuestion)}
            {renderChipQuestion(companyTypeQuestion)}
            <div style={{ display: 'grid', gap: 12 }}>
              {renderTextQuestion(includeCompaniesQuestion)}
              {renderTextQuestion(excludeCompaniesQuestion)}
            </div>
          </div>
        </section>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="button"
          onClick={handleSubmit}
          disabled={submitting || questions.length === 0}
        >
          {submitting ? 'Updating...' : 'Update Preferences'}
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={handleReset}
          disabled={submitting || Object.keys(answers).length === 0}
        >
          Clear answers
        </button>
        {error && <span className="error-text">{error}</span>}
      </div>

      {showSuccess && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            display: 'grid',
            placeItems: 'center',
            // zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(17,24,39,0.97), rgba(15,23,42,0.92))',
              borderRadius: 18,
              padding: '28px 32px',
              border: '1px solid rgba(94, 234, 212, 0.25)',
              boxShadow: '0 22px 40px rgba(15, 23, 42, 0.45)',
              maxWidth: 420,
              width: '100%',
            }}
          >
            <p style={{ margin: 0, color: '#38bdf8', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2 }}>
              Success
            </p>
            <h3 style={{ margin: '8px 0 12px', color: '#e2e8f0', fontSize: 22 }}>Preferences synced</h3>
            <p style={{ margin: 0, color: 'rgba(226,232,240,0.8)' }}>
              We'll use your updated filters to personalise upcoming job matches.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="button" onClick={handleCloseSuccess} type="button">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PreferenceRefinement;







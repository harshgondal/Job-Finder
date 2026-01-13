import { useState } from 'react';
import axios from 'axios';
import { useProfile } from '../context/ProfileContext';

interface ResumeUploadProps {
  onProfileCreated?: (profile: any, questions: string[], profileId: string) => void;
  showHeader?: boolean;
  wrapperClassName?: string;
}

function ResumeUpload({ onProfileCreated, showHeader = true, wrapperClassName }: ResumeUploadProps) {
  const {
    profileId,
    resume,
    setProfile,
    setProfileId,
    setRefinementQuestions,
    setRefinementContext,
    setResume,
    setInterests,
    refreshProfile,
    clearProfile,
    loading,
  } = useProfile();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await axios.post('/api/profile/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { profile, profile_id, refinement_questions, resume: resumeMeta } = response.data;
      const questionList = Array.isArray(refinement_questions?.questions)
        ? refinement_questions.questions
        : [];

      const normalizedProfile = { ...profile, profile_id };

      setProfile(normalizedProfile);
      setProfileId(profile_id);
      setRefinementQuestions(questionList);
      setRefinementContext(refinement_questions?.context || '');
      setResume(resumeMeta || null);
      if (Array.isArray(normalizedProfile.interests) && normalizedProfile.interests.length > 0) {
        setInterests(normalizedProfile.interests.join(', '));
      }

      onProfileCreated?.(normalizedProfile, questionList, profile_id);

      setSuccess('Resume processed successfully.');
      setFile(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload resume');
      setSuccess(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!profileId) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await axios.delete('/api/profile');
      clearProfile();
      setSuccess('Stored resume deleted.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete resume');
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = async () => {
    setError(null);
    setSuccess(null);
    await refreshProfile();
  };

  const containerClass = [wrapperClassName ?? 'card', 'resume-upload'].filter(Boolean).join(' ');

  const hasStoredResume = Boolean(profileId && resume);
  const formattedUploadedAt = resume?.uploadedAt ? new Date(resume.uploadedAt).toLocaleString() : null;

  return (
    <div className={containerClass}>
      {showHeader && (
        <header className="resume-upload__intro">
          <span className="resume-upload__eyebrow">Profile (optional)</span>
          <h2 className="resume-upload__title">Upload your resume</h2>
          <p className="resume-upload__subtitle">
            Unlock fresher matches, tailored insights, and instant refinement prompts.
          </p>
        </header>
      )}

      <section className="resume-upload__content">
        {hasStoredResume && (
          <div className="resume-upload__stored">
            <div className="resume-upload__stored-meta">
              <span className="resume-upload__badge">Current resume</span>
              <p className="resume-upload__filename">{resume?.originalName || resume?.filename}</p>
              {formattedUploadedAt && (
                <p className="resume-upload__timestamp">Uploaded {formattedUploadedAt}</p>
              )}
            </div>
            <div className="resume-upload__stored-actions">
              <button
                className="button ghost resume-upload__action"
                type="button"
                onClick={handleRefresh}
                disabled={loading || uploading || deleting}
              >
                Refresh
              </button>
              <button
                className="button ghost resume-upload__action resume-upload__action--delete"
                type="button"
                onClick={handleDelete}
                disabled={deleting || uploading}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="resume-upload__picker">
          <input
            id="resume-upload-input"
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            hidden
          />
          <label className="resume-upload__dropzone" htmlFor="resume-upload-input">
            <span className="resume-upload__icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4" />
                <path d="m8 8 4-4 4 4" />
                <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
              </svg>
            </span>
            <div className="resume-upload__dropzone-text">
              <span className="resume-upload__primary-text">Click to select a PDF</span>
              <span className="resume-upload__secondary-text">
                {file?.name || 'We’ll parse key skills, experience, and interests'}
              </span>
            </div>
          </label>
          <p className="resume-upload__helper">Only PDF files are supported at this time.</p>
        </div>

        {error && <p className="resume-upload__feedback resume-upload__feedback--error">{error}</p>}
        {success && (
          <p className="resume-upload__feedback resume-upload__feedback--success">{success}</p>
        )}

        <div className="resume-upload__actions">
          <button
            className="button resume-upload__submit"
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading ? 'Processing…' : 'Upload & Parse'}
          </button>
          <p className="resume-upload__hint">Keep searching even if you skip this step.</p>
        </div>
      </section>
    </div>
  );
}

export default ResumeUpload;



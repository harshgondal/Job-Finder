const { normalizeStringArray } = require('../utils/preferences');

const STANDARD_QUESTIONS = [
  {
    id: 'experience_level',
    prompt: 'What experience level should the role target?',
    type: 'single-select',
    options: [
      { value: 'intern', label: 'Intern' },
      { value: 'entry', label: 'Entry-level / New Grad' },
      { value: 'one_to_three', label: '1–3 years' },
      { value: 'three_to_five', label: '3–5 years' },
    ],
  },
  {
    id: 'work_modes',
    prompt: 'Which work modes are acceptable?',
    type: 'multi-select',
    options: [
      { value: 'remote', label: 'Remote' },
      { value: 'hybrid', label: 'Hybrid' },
      { value: 'onsite', label: 'On-site' },
    ],
  },
  {
    id: 'employment_types',
    prompt: 'What type of employment are you looking for?',
    type: 'multi-select',
    options: [
      { value: 'full-time', label: 'Full-time' },
      { value: 'contract', label: 'Contract' },
      { value: 'internship', label: 'Internship' },
      { value: 'temporary', label: 'Temporary' },
    ],
  },
  {
    id: 'company_sizes',
    prompt: 'What company sizes should be included?',
    type: 'multi-select',
    options: [
      { value: 'startup', label: 'Startup (1–50)' },
      { value: 'small', label: 'Small (51–200)' },
      { value: 'mid', label: 'Mid-size (201–1000)' },
      { value: 'enterprise', label: 'Large enterprise (1000+)' },
    ],
    optional: true,
  },
  {
    id: 'company_types',
    prompt: 'Which company types should be prioritized?',
    type: 'multi-select',
    options: [
      { value: 'product', label: 'Product-based' },
      { value: 'service', label: 'Service-based' },
      { value: 'research', label: 'Research lab' },
      { value: 'consulting', label: 'Consulting' },
      { value: 'startup', label: 'Startup' },
    ],
    optional: true,
  },
  {
    id: 'preferred_companies_include',
    prompt: 'Preferred companies to include (optional)',
    type: 'text',
    helperText: 'Comma-separated list, e.g., Google, Amazon, Microsoft',
    optional: true,
  },
  {
    id: 'preferred_companies_exclude',
    prompt: 'Companies to avoid (optional)',
    type: 'text',
    helperText: 'Comma-separated list, e.g., Consultancy firms',
    optional: true,
  },
];

function createRefinementSnapshot() {
  return {
    questions: STANDARD_QUESTIONS,
    context:
      'These filters map directly to job-board parameters so your matches stay aligned with your preferences.',
  };
}

function applyPreferencesToProfile(currentProfile = {}, answers = {}) {
  const updatedProfile = { ...currentProfile };

  const toArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return normalizeStringArray(value);
    }
    return [];
  };

  const setArrayField = (key, values, transform = (val) => val) => {
    const cleaned = toArray(values).map((val) => transform(val));
    if (cleaned.length > 0) {
      updatedProfile[key] = cleaned;
    } else if (updatedProfile[key]) {
      delete updatedProfile[key];
    }
  };

  const experienceLevels = toArray(answers.experience_level);
  if (experienceLevels.length > 0) {
    updatedProfile.preference_experience_levels = experienceLevels.map((level) => level.toLowerCase());
  } else if (updatedProfile.preference_experience_levels) {
    delete updatedProfile.preference_experience_levels;
  }

  const workModes = toArray(answers.work_modes).map((mode) => mode.toLowerCase());
  if (workModes.length > 0) {
    updatedProfile.preference_work_modes = workModes;
  } else {
    delete updatedProfile.preference_work_modes;
  }
  delete updatedProfile.preference_work_mode;

  setArrayField(
    'preference_employment_types',
    answers.employment_types,
    (value) => value.toLowerCase()
  );

  setArrayField(
    'preference_company_sizes',
    answers.company_sizes,
    (value) => value.toLowerCase()
  );

  setArrayField(
    'preference_company_types',
    answers.company_types,
    (value) => value.toLowerCase()
  );

  const includedCompanies = toArray(answers.preferred_companies_include);
  if (includedCompanies.length > 0) {
    updatedProfile.target_companies = includedCompanies;
  }

  const excludedCompanies = toArray(answers.preferred_companies_exclude);
  if (excludedCompanies.length > 0) {
    updatedProfile.excluded_companies = excludedCompanies;
  } else if (updatedProfile.excluded_companies) {
    delete updatedProfile.excluded_companies;
  }

  return updatedProfile;
}

module.exports = {
  STANDARD_QUESTIONS,
  createRefinementSnapshot,
  applyPreferencesToProfile,
};

const REMOTE_KEYWORDS = ['remote', 'work from home', 'wfh', 'anywhere', 'distributed'];
const HYBRID_KEYWORDS = ['hybrid', 'flexible location', 'split between'];
const ONSITE_KEYWORDS = ['on-site', 'onsite', 'on site', 'office-based'];

function normalizeStringArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[,;/]|\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

function toLowerUnique(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
        .filter(Boolean)
    )
  );
}

function firstTruthy(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function workModeMatchesPreference(preference, mode) {
  if (!preference || !mode) return true;
  if (preference === 'remote') {
    return mode === 'remote' || mode === 'hybrid';
  }
  if (preference === 'hybrid') {
    return mode === 'hybrid';
  }
  if (preference === 'onsite' || preference === 'on-site') {
    return mode === 'onsite' || mode === 'hybrid';
  }
  return true;
}

function inferWorkMode(normalizedJob, rawJob) {
  const normalizedMode = normalizedJob?.normalized?.work_mode || normalizedJob?.work_mode;
  if (normalizedMode) {
    return normalizedMode.toLowerCase();
  }

  const text = [
    normalizedJob?.normalized?.summary,
    normalizedJob?.summary,
    normalizedJob?.description,
    rawJob?.description,
    normalizedJob?.title,
    rawJob?.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) return null;

  if (REMOTE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'remote';
  }
  if (HYBRID_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'hybrid';
  }
  if (ONSITE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'onsite';
  }
  return null;
}

function buildPreferenceSignals(profile = {}) {
  const industriesList = normalizeStringArray(
    profile.preferred_industries || profile.preference_industries || profile.domains
  );
  const companiesList = normalizeStringArray(
    profile.target_companies || profile.preference_target_companies
  );
  const locationList = normalizeStringArray(profile.preferred_locations);
  const interestsList = normalizeStringArray(profile.interests);
  const focusAreaList = normalizeStringArray(profile.inferred_preferences?.focus_area);

  const allInterestKeywords = toLowerUnique([
    ...interestsList,
    ...industriesList,
    ...focusAreaList,
    ...(profile.roles || []),
  ]);

  const preferredWorkModeList = normalizeStringArray(profile.preference_work_modes);
  const legacyWorkMode = firstTruthy(
    profile.preference_work_mode,
    profile.preferred_work_mode,
    profile.inferred_preferences?.work_mode_preference
  );
  const resolvedWorkModes = preferredWorkModeList.length
    ? preferredWorkModeList
    : legacyWorkMode
    ? [legacyWorkMode]
    : [];
  const primaryWorkMode = resolvedWorkModes.length > 0 ? resolvedWorkModes[0].toLowerCase() : null;

  return {
    workMode: primaryWorkMode,
    workModes: toLowerUnique(resolvedWorkModes),
    locations: toLowerUnique(locationList),
    locationsOriginal: locationList,
    industries: toLowerUnique(industriesList),
    industriesOriginal: industriesList,
    targetCompanies: toLowerUnique(companiesList),
    targetCompaniesOriginal: companiesList,
    interestKeywords: allInterestKeywords,
  };
}

function evaluateJobAgainstPreferences({ normalizedJob, rawJob }, signals) {
  if (!signals) {
    return {
      adjustment: 0,
      exclude: false,
      matches: {},
      mismatches: {},
    };
  }

  const matches = {
    workMode: false,
    company: false,
    industry: false,
    interests: false,
    location: false,
  };
  const mismatches = {
    workMode: false,
    location: false,
    industry: false,
  };

  let adjustment = 0;
  let exclude = false;

  const jobCompany = (normalizedJob?.company || rawJob?.company || '').toLowerCase();
  const jobLocation = (normalizedJob?.location || rawJob?.location || '').toLowerCase();
  const jobText = [
    normalizedJob?.normalized?.summary,
    normalizedJob?.summary,
    normalizedJob?.description,
    rawJob?.description,
    normalizedJob?.title,
    rawJob?.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const workMode = inferWorkMode(normalizedJob, rawJob);

  if (signals.workMode) {
    if (workMode) {
      if (workModeMatchesPreference(signals.workMode, workMode)) {
        matches.workMode = true;
        adjustment += 12;
      } else {
        mismatches.workMode = true;
        adjustment -= signals.workMode === 'remote' ? 24 : 18;
      }
    } else if (signals.workMode === 'remote') {
      // Missing remote hint when remote preference is strict
      mismatches.workMode = true;
      adjustment -= 14;
    }
  }

  if (signals.locations?.length) {
    const normalizedLocation = jobLocation ? jobLocation.trim() : '';
    const locationMatches = signals.locations.some((loc) => normalizedLocation.includes(loc));
    const remoteFriendly =
      normalizedLocation.includes('remote') ||
      normalizedLocation.includes('anywhere') ||
      workMode === 'remote' ||
      workMode === 'hybrid';

    if (locationMatches) {
      matches.location = true;
      adjustment += 6;
    } else if (!normalizedLocation) {
      adjustment -= 2;
    } else if (remoteFriendly) {
      adjustment -= signals.workMode === 'remote' ? 2 : 4;
    } else {
      mismatches.location = true;
      adjustment -= signals.workMode === 'remote' ? 14 : 10;
    }
  }

  if (signals.targetCompanies?.length && jobCompany) {
    const companyMatch = signals.targetCompanies.some((company) => jobCompany.includes(company));
    if (companyMatch) {
      matches.company = true;
      adjustment += 15;
    }
  }

  if (signals.industries?.length && jobText) {
    const industryMatch = signals.industries.some((industry) => jobText.includes(industry));
    if (industryMatch) {
      matches.industry = true;
      adjustment += 8;
    } else {
      mismatches.industry = true;
      adjustment -= 6;
    }
  }

  if (!matches.industry && signals.interestKeywords?.length && jobText) {
    const interestMatch = signals.interestKeywords.some((keyword) => jobText.includes(keyword));
    if (interestMatch) {
      matches.interests = true;
      adjustment += 5;
    }
  }

  return {
    adjustment,
    exclude,
    matches,
    mismatches,
    workMode,
  };
}

module.exports = {
  buildPreferenceSignals,
  evaluateJobAgainstPreferences,
  inferWorkMode,
  normalizeStringArray,
};

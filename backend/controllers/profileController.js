const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { ProfileAgent } = require('../agents/profileAgent');
const {
  createRefinementSnapshot,
  applyPreferencesToProfile,
} = require('../agents/preferenceRefinementAgent');
const { config } = require('../config/env');
const { getJson, setJson, deleteKey } = require('../config/redis');
const { JobEmailError, sendJobsEmailForUser } = require('../services/jobEmailService');
const { scheduleJobForUser, cancelJobForUser } = require('../services/jobEmailScheduler');
const { normalizeStringArray } = require('../utils/preferences');

// Configure multer with absolute path
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'resume-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const profileAgent = new ProfileAgent();

const PROFILE_CACHE_KEY_PREFIX = 'profile:';
const PROFILE_CACHE_TTL_SECONDS = Math.max(300, Math.floor((config.CACHE_TTL_MINUTES || 15) * 60));

function normalizePreferenceAnswers(answers = {}) {
  const toCleanArray = (value) => normalizeStringArray(value);

  const experienceLevel = (() => {
    const level = Array.isArray(answers.experience_level)
      ? answers.experience_level.find((item) => typeof item === 'string' && item.trim())
      : typeof answers.experience_level === 'string'
      ? answers.experience_level.trim()
      : null;
    return level || null;
  })();

  const workModes = toCleanArray(answers.work_modes).map((mode) => mode.toLowerCase());
  const employmentTypes = toCleanArray(answers.employment_types).map((type) => type.toLowerCase());
  const companySizes = toCleanArray(answers.company_sizes).map((size) => size.toLowerCase());
  const companyTypes = toCleanArray(answers.company_types).map((type) => type.toLowerCase());
  const includeCompanies = normalizeStringArray(answers.preferred_companies_include);
  const excludeCompanies = normalizeStringArray(answers.preferred_companies_exclude);

  return {
    experienceLevel,
    workModes,
    employmentTypes,
    companySizes,
    companyTypes,
    includeCompanies,
    excludeCompanies,
    lastAnswers: answers || {},
    lastUpdatedAt: new Date(),
  };
}

function serializePreferences(rawPreferences = {}) {
  const base = rawPreferences && typeof rawPreferences === 'object' ? rawPreferences : {};

  return {
    experienceLevel: typeof base.experienceLevel === 'string' ? base.experienceLevel : null,
    workModes: Array.isArray(base.workModes) ? base.workModes : [],
    employmentTypes: Array.isArray(base.employmentTypes) ? base.employmentTypes : [],
    companySizes: Array.isArray(base.companySizes) ? base.companySizes : [],
    companyTypes: Array.isArray(base.companyTypes) ? base.companyTypes : [],
    includeCompanies: Array.isArray(base.includeCompanies) ? base.includeCompanies : [],
    excludeCompanies: Array.isArray(base.excludeCompanies) ? base.excludeCompanies : [],
    notes: typeof base.notes === 'string' ? base.notes : null,
    lastUpdatedAt: base.lastUpdatedAt || null,
    lastAnswers: base.lastAnswers || {},
  };
}

function getProfileCacheKey(profileId) {
  return `${PROFILE_CACHE_KEY_PREFIX}${profileId}`;
}

async function getCachedProfile(profileId) {
  if (!profileId) return null;
  return getJson(getProfileCacheKey(profileId));
}

async function setProfileCache(profileId, profile) {
  if (!profileId || !profile) return;
  const payload = { ...profile, profile_id: profileId };
  await setJson(getProfileCacheKey(profileId), payload, PROFILE_CACHE_TTL_SECONDS);
}

async function deleteProfileCache(profileId) {
  if (!profileId) return;
  await deleteKey(getProfileCacheKey(profileId));
}

function safeDeleteFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('[ProfileController] Failed to delete file', filePath, err.message);
  }
}

function isStructuredQuestionSet(payload) {
  if (!payload || !Array.isArray(payload.questions)) {
    return false;
  }

  return payload.questions.every((item) =>
    item && typeof item.id === 'string' && typeof item.prompt === 'string' && typeof item.type === 'string'
  );
}

async function getRefinementSnapshot(existingSnapshot) {
  if (isStructuredQuestionSet(existingSnapshot)) {
    return existingSnapshot;
  }

  return {
    ...createRefinementSnapshot(),
    updatedAt: new Date(),
  };
}

async function uploadResume(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filePath = req.file.path;
    console.log('[ProfileController] File uploaded to:', filePath);
    
    const dataBuffer = fs.readFileSync(filePath);
    
    // Extract text from PDF
    const pdfData = await pdf(dataBuffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length === 0) {
      // Clean up uploaded file if it's invalid
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Could not extract text from PDF. Please ensure the PDF contains readable text.' });
    }

    // Parse resume with Profile Agent
    console.log('ProfileAgent invoked');
    const profile = await profileAgent.parseResume(resumeText);
    profile.interests = profile.interests || [];
    const profileId = `profile_${req.user.email.replace(/[^a-z0-9]/gi, '').toLowerCase()}_${Date.now()}`;
    console.log('ProfileAgent completed');
    profile.profile_id = profileId;
    
    // Update user's resume info in database
    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user) {
      safeDeleteFile(filePath);
      return res.status(404).json({ error: 'User not found' });
    }

    const structuredSnapshot = {
      ...createRefinementSnapshot(),
      generatedAt: new Date(),
    };

    // Clean up old resume file and cache
    if (user.resume?.profileId && user.resume.profileId !== profileId) {
      deleteProfileCache(user.resume.profileId);
    }
    if (user.resume?.path && user.resume.path !== filePath) {
      safeDeleteFile(user.resume.path);
    }

    user.resume = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: filePath,
      uploadedAt: new Date(),
      profileId,
    };
    user.resumeProfile = profile;
    user.resumeRefinement = structuredSnapshot;
    if (Array.isArray(profile.interests) && profile.interests.length > 0) {
      user.interests = profile.interests;
    }

    await user.save();

    await setProfileCache(profileId, profile);

    res.json({
      profile_id: profileId,
      profile,
      refinement_questions: structuredSnapshot,
      resume: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        uploadedAt: user.resume.uploadedAt,
      },
    });
  } catch (error) {
    console.error('[ProfileController] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to process resume' });
  }
}

async function refinePreferences(req, res) {
  try {
    const { profile_id, answers = {}, interests, notes } = req.body || {};

    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profileId = typeof profile_id === 'string' && profile_id.trim() ? profile_id.trim() : null;
    if (!profileId && user.resume?.profileId) {
      profileId = user.resume.profileId;
    }

    let currentProfile = null;
    if (profileId) {
      currentProfile = await getCachedProfile(profileId);
      if (!currentProfile && user.resume?.profileId === profileId && user.resumeProfile) {
        currentProfile = { ...user.resumeProfile, profile_id: profileId };
        await setProfileCache(profileId, currentProfile);
      }
    }

    const normalizedPreferences = normalizePreferenceAnswers(answers);
    const existingPreferences = serializePreferences(user.preferences);
    const mergedPreferences = {
      ...existingPreferences,
      ...normalizedPreferences,
      notes:
        typeof notes === 'string'
          ? notes.trim() || null
          : existingPreferences.notes || null,
    };
    user.preferences = mergedPreferences;

    if (interests) {
      if (Array.isArray(interests)) {
        user.interests = interests;
      } else if (typeof interests === 'string') {
        user.interests = interests.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    let updatedProfile = null;
    if (currentProfile) {
      updatedProfile = applyPreferencesToProfile(currentProfile, answers);

      if (Array.isArray(user.interests) && user.interests.length > 0) {
        updatedProfile.interests = user.interests;
      }

      updatedProfile.profile_id = profileId;
      await setProfileCache(profileId, updatedProfile);
      user.resumeProfile = updatedProfile;
    }

    const refinementSnapshot = await getRefinementSnapshot(user.resumeRefinement);
    user.resumeRefinement = {
      ...refinementSnapshot,
      lastAnswers: answers || {},
      updatedAt: new Date(),
    };

    await user.save();

    res.json({
      profile_id: profileId,
      profile: updatedProfile || currentProfile,
      refinement_questions: user.resumeRefinement,
      preferences: serializePreferences(user.preferences),
    });
  } catch (error) {
    console.error('[ProfileController] Refinement error:', error);
    res.status(500).json({ error: error.message || 'Failed to refine preferences' });
  }
}

async function getProfile(req, res) {
  try {
    const { profile_id } = req.params;

    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cachedProfile = await getCachedProfile(profile_id);
    if (cachedProfile) {
      const refinementSnapshot = await getRefinementSnapshot(user.resumeRefinement);
      user.resumeRefinement = refinementSnapshot;
      await user.save();
      return res.json({
        profile_id,
        profile: cachedProfile,
        refinement_questions: refinementSnapshot,
        preferences: serializePreferences(user.preferences),
      });
    }

    if (user.resume?.profileId === profile_id && user.resumeProfile) {
      await setProfileCache(profile_id, user.resumeProfile);
      const refinementSnapshot = await getRefinementSnapshot(user.resumeRefinement);
      user.resumeRefinement = refinementSnapshot;
      await user.save();
      return res.json({
        profile_id,
        profile: { ...user.resumeProfile, profile_id },
        refinement_questions: refinementSnapshot,
        preferences: serializePreferences(user.preferences),
      });
    }

    return res.status(404).json({ error: 'Profile not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getCurrentProfile(req, res) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profileId = user.resume?.profileId || null;
    let profilePayload = null;

    if (profileId && user.resumeProfile) {
      await setProfileCache(profileId, user.resumeProfile);
      profilePayload = { ...user.resumeProfile, profile_id: profileId };
    }

    const refinementSnapshot = await getRefinementSnapshot(user.resumeRefinement);
    user.resumeRefinement = refinementSnapshot;
    await user.save();

    res.json({
      profile_id: profileId,
      profile: profilePayload,
      refinement_questions: refinementSnapshot,
      preferences: serializePreferences(user.preferences),
      resume: user.resume
        ? {
            filename: user.resume.filename,
            originalName: user.resume.originalName,
            uploadedAt: user.resume.uploadedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('[ProfileController] Current profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stored resume' });
  }
}

async function deleteResume(req, res) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user || !user.resume?.profileId) {
      return res.status(404).json({ error: 'No resume on file' });
    }

    const { profileId, path: storedPath } = user.resume;
    safeDeleteFile(storedPath);
    await deleteProfileCache(profileId);

    user.resume = undefined;
    user.markModified('resume');
    user.resumeProfile = null;
    user.resumeRefinement = null;
    await user.save();

    res.json({ success: true });
  } catch (error) {
    console.error('[ProfileController] Delete resume error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete resume' });
  }
}

async function loadProfileById(profileId) {
  if (!profileId) return null;

  const cached = await getCachedProfile(profileId);
  if (cached) {
    return cached;
  }

  const user = await User.findOne({ 'resume.profileId': profileId });
  if (!user || !user.resumeProfile) {
    return null;
  }

  const profile = { ...user.resumeProfile, profile_id: profileId };
  await setProfileCache(profileId, profile);
  return profile;
}

async function updateProfileRecentJobs(profileId, jobs) {
  if (!profileId || !Array.isArray(jobs) || jobs.length === 0) {
    return null;
  }

  const normalized = [];
  const seenNew = new Set();

  const toKey = (entry) => {
    if (!entry) return null;
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const company = typeof entry.company === 'string' ? entry.company.trim() : '';
    const location = typeof entry.location === 'string' ? entry.location.trim() : '';
    const idPart = entry.id ? entry.id.toString().trim() : '';
    const composed = [idPart, title, company, location].filter(Boolean).join('|');
    if (!composed) return null;
    return composed.toLowerCase();
  };

  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue;

    const company = typeof job.company === 'string' ? job.company.trim() : '';
    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const location = typeof job.location === 'string' ? job.location.trim() : '';
    const externalUrl = typeof job.externalUrl === 'string' ? job.externalUrl.trim() : '';
    const postedAt = typeof job.postedAt === 'string' ? job.postedAt : null;
    const source = typeof job.source === 'string' ? job.source.trim() : null;

    if (!company || !title) continue;

    const dedupeKey = toKey({ id: job.id, title: job.title, company: job.company, location: job.location });
    if (!dedupeKey || seenNew.has(dedupeKey)) continue;
    seenNew.add(dedupeKey);

    normalized.push({
      id: job.id ? String(job.id) : null,
      title,
      company,
      location: location || null,
      externalUrl: externalUrl || null,
      postedAt,
      source,
      capturedAt: new Date(),
    });
  }

  if (normalized.length === 0) {
    return null;
  }

  const user = await User.findOne({ 'resume.profileId': profileId });
  if (!user) {
    return null;
  }

  const existing = Array.isArray(user.recentJobs) && user.recentJobs.length > 0
    ? user.recentJobs
    : [];

  const combined = [...normalized];
  const seenCombined = new Set(normalized.map((entry) => toKey(entry)).filter(Boolean));

  for (const entry of existing) {
    if (!entry || typeof entry !== 'object') continue;
    const key = toKey(entry);
    if (!key || seenCombined.has(key)) continue;

    combined.push({
      id: entry.id ? String(entry.id) : null,
      title: typeof entry.title === 'string' ? entry.title.trim() : null,
      company: typeof entry.company === 'string' ? entry.company.trim() : null,
      location: typeof entry.location === 'string' ? entry.location.trim() : null,
      externalUrl: typeof entry.externalUrl === 'string' ? entry.externalUrl.trim() : null,
      postedAt: typeof entry.postedAt === 'string' ? entry.postedAt : null,
      source: typeof entry.source === 'string' ? entry.source.trim() : null,
      capturedAt: entry.capturedAt instanceof Date
        ? entry.capturedAt
        : entry.capturedAt
          ? new Date(entry.capturedAt)
          : new Date(),
    });
    seenCombined.add(key);
  }

  const limited = combined
    .sort((a, b) => {
      const aTime = a.capturedAt instanceof Date ? a.capturedAt.getTime() : new Date(a.capturedAt || Date.now()).getTime();
      const bTime = b.capturedAt instanceof Date ? b.capturedAt.getTime() : new Date(b.capturedAt || Date.now()).getTime();
      return bTime - aTime;
    })
    .slice(0, 5);

  user.recentJobs = limited.map((entry) => ({
    ...entry,
    capturedAt: entry.capturedAt instanceof Date ? entry.capturedAt : new Date(entry.capturedAt || Date.now()),
  }));
  user.markModified('recentJobs');
  await user.save();

  await setProfileCache(profileId, { ...user.resumeProfile, profile_id: profileId });

  return limited;
}

async function sendProfileJobsEmail(req, res) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userEmail = req.user.email.toLowerCase();
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    try {
      const result = await sendJobsEmailForUser(user);
      user.jobEmailScheduleLastRunAt = new Date();
      user.jobEmailScheduleLastError = null;
      await user.save();
      return res.json(result);
    } catch (error) {
      user.jobEmailScheduleLastRunAt = new Date();
      user.jobEmailScheduleLastError = error.message || 'Failed to send jobs email';
      try {
        await user.save();
      } catch (persistError) {
        console.error('[ProfileController] Failed to persist job email error state:', persistError);
      }

      if (error instanceof JobEmailError) {
        return res.status(error.status).json({ error: error.message, details: error.details || null });
      }

      console.error('[ProfileController] Send jobs email error:', error);
      return res.status(500).json({ error: error.message || 'Failed to send jobs email' });
    }
  } catch (error) {
    console.error('[ProfileController] Send jobs email error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send jobs email' });
  }
}

async function getJobEmailSchedule(req, res) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      enabled: Boolean(user.jobEmailScheduleEnabled),
      lastRunAt: user.jobEmailScheduleLastRunAt,
      lastError: user.jobEmailScheduleLastError,
      cronExpression: config.JOB_EMAIL_CRON,
    });
  } catch (error) {
    console.error('[ProfileController] Get job email schedule error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch schedule status' });
  }
}

async function updateJobEmailSchedule(req, res) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Request body must include boolean "enabled".' });
    }

    const user = await User.findOne({ email: req.user.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (enabled) {
      if (!user.jobEmailScheduleEnabled) {
        user.jobEmailScheduleEnabled = true;
        user.jobEmailScheduleLastError = null;
        await user.save();

        try {
          await scheduleJobForUser(user._id);
        } catch (error) {
          user.jobEmailScheduleEnabled = false;
          await user.save();
          console.error('[ProfileController] Failed to schedule job emails:', error);
          return res.status(500).json({ error: error.message || 'Failed to schedule job emails' });
        }
      }
    } else if (user.jobEmailScheduleEnabled) {
      user.jobEmailScheduleEnabled = false;
      await user.save();
      cancelJobForUser(user._id);
    }

    return res.json({
      enabled: Boolean(user.jobEmailScheduleEnabled),
      lastRunAt: user.jobEmailScheduleLastRunAt,
      lastError: user.jobEmailScheduleLastError,
      cronExpression: config.JOB_EMAIL_CRON,
    });
  } catch (error) {
    console.error('[ProfileController] Update job email schedule error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update schedule' });
  }
}

module.exports = {
  uploadResume: [upload.single('resume'), uploadResume],
  refinePreferences,
  getProfile,
  getCurrentProfile,
  deleteResume,
  loadProfileById,
  updateProfileRecentJobs,
  sendProfileJobsEmail,
  getJobEmailSchedule,
  updateJobEmailSchedule,
};


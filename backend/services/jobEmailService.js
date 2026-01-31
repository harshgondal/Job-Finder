const axios = require('axios');
const { config } = require('../config/env');

class JobEmailError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'JobEmailError';
    this.status = status;
    this.details = details;
  }
}

function serializeJobs(jobs) {
  if (!Array.isArray(jobs)) return [];
  return jobs
    .filter(Boolean)
    .slice(0, 5)
    .map((job) => {
      const base = typeof job?.toObject === 'function' ? job.toObject() : job;
      return {
        ...base,
        id: base?.id ? String(base.id) : base?._id ? String(base._id) : null,
        capturedAt:
          base?.capturedAt instanceof Date
            ? base.capturedAt.toISOString()
            : base?.capturedAt || null,
      };
    })
    .filter((job) => job.title && job.company);
}

async function sendJobsEmailForUser(user) {
  if (!user) {
    throw new JobEmailError('User document is required to send jobs email.', 500);
  }

  if (!config.N8N_WEBHOOK_URL) {
    throw new JobEmailError('N8N webhook URL is not configured on the server.', 500);
  }

  const storedJobs = serializeJobs(user.recentJobs);
  if (storedJobs.length === 0) {
    throw new JobEmailError(
      'No recent jobs available to send. Try running a job search first.',
      400
    );
  }

  const profileId = user.resume?.profileId || null;
  const payload = {
    email: user.email,
    profile: {
      id: profileId,
      name: user.resumeProfile?.name || user.name || null,
    },
    jobs: storedJobs,
    sentAt: new Date().toISOString(),
  };

  console.log('[JobEmailService] Triggering job email webhook', {
    email: payload.email,
    jobsCount: storedJobs.length,
    sampleJob: storedJobs[0] ? { title: storedJobs[0].title, company: storedJobs[0].company } : null,
  });

  try {
    await axios.post(config.N8N_WEBHOOK_URL, payload);
  } catch (err) {
    const status = err.response?.status;
    const statusText = err.response?.statusText;
    const responseData = err.response?.data;
    const details = {
      status: status ?? 'unknown',
      statusText: statusText ?? 'unknown',
      responseData,
    };

    console.error('[JobEmailService] Failed to invoke n8n webhook', {
      message: err.message,
      ...details,
    });

    throw new JobEmailError('Failed to invoke n8n webhook', 502, details);
  }

  return { success: true, jobsSent: storedJobs.length };
}

module.exports = {
  JobEmailError,
  sendJobsEmailForUser,
};

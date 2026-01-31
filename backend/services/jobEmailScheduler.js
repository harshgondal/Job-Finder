const cron = require('node-cron');
const { config } = require('../config/env');
const User = require('../models/User');
const { sendJobsEmailForUser, JobEmailError } = require('./jobEmailService');

const scheduledJobs = new Map();

async function runJobOnce(userId) {
  if (!userId) return;

  try {
    const user = await User.findById(userId);
    if (!user || !user.jobEmailScheduleEnabled) {
      cancelJobForUser(userId);
      return;
    }

    try {
      await sendJobsEmailForUser(user);
      user.jobEmailScheduleLastRunAt = new Date();
      user.jobEmailScheduleLastError = null;
    } catch (error) {
      const lastErrorMessage =
        error instanceof JobEmailError ? error.message : error?.message || 'Failed to send jobs email';

      user.jobEmailScheduleLastRunAt = new Date();
      user.jobEmailScheduleLastError = lastErrorMessage;

      if (error instanceof JobEmailError && error.status === 400) {
        // Disable schedule when the failure is expected (e.g., no jobs to send)
        user.jobEmailScheduleEnabled = false;
        cancelJobForUser(userId);
      }

      console.error('[JobEmailScheduler] Failed job run', {
        userId: user._id.toString(),
        message: error.message,
      });
    }

    await user.save();
  } catch (error) {
    console.error('[JobEmailScheduler] Unexpected error while running job', {
      userId: userId.toString(),
      message: error.message,
    });
  }
}

function scheduleJobForUser(userId) {
  if (!userId) {
    throw new Error('userId is required to schedule job emails');
  }

  const idString = userId.toString();

  if (scheduledJobs.has(idString)) {
    return scheduledJobs.get(idString);
  }

  const expression = config.JOB_EMAIL_CRON || '0 9 * * *';

  if (!cron.validate(expression)) {
    throw new Error(`Invalid cron expression configured for job emails: ${expression}`);
  }

  const task = cron.schedule(expression, () => runJobOnce(userId), {
    scheduled: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  scheduledJobs.set(idString, task);
  return task;
}

function cancelJobForUser(userId) {
  if (!userId) return;
  const idString = userId.toString();
  const task = scheduledJobs.get(idString);
  if (task) {
    task.stop();
    scheduledJobs.delete(idString);
  }
}

async function bootstrapJobEmailScheduler() {
  try {
    const enabledUsers = await User.find({ jobEmailScheduleEnabled: true }, { _id: 1 }).lean();
    enabledUsers.forEach((user) => {
      try {
        scheduleJobForUser(user._id);
      } catch (error) {
        console.error('[JobEmailScheduler] Failed to schedule job for user during bootstrap', {
          userId: user._id?.toString?.() || String(user._id),
          message: error.message,
        });
      }
    });
    console.log('[JobEmailScheduler] Bootstrap complete for', enabledUsers.length, 'users');
  } catch (error) {
    console.error('[JobEmailScheduler] Failed to bootstrap scheduler', error);
  }
}

module.exports = {
  scheduleJobForUser,
  cancelJobForUser,
  bootstrapJobEmailScheduler,
  runJobOnce,
};

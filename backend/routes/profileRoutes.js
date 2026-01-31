const express = require('express');
const {
  uploadResume,
  refinePreferences,
  getProfile,
  getCurrentProfile,
  deleteResume,
  sendProfileJobsEmail,
  getJobEmailSchedule,
  updateJobEmailSchedule,
} = require('../controllers/profileController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/upload', authMiddleware, uploadResume);
router.post('/refine', authMiddleware, refinePreferences);
router.get('/job-email/schedule', authMiddleware, getJobEmailSchedule);
router.put('/job-email/schedule', authMiddleware, updateJobEmailSchedule);
router.get('/', authMiddleware, getCurrentProfile);
router.delete('/', authMiddleware, deleteResume);
router.post('/send-jobs-email', authMiddleware, sendProfileJobsEmail);
router.get('/:profile_id', authMiddleware, getProfile);

module.exports = router;

const express = require('express');
const { searchJobs, getCompanyResearch, getMatchStatus } = require('../controllers/jobController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/jobs/search with body: { role, location?, profile_id?, preference_notes? }
router.post('/search', authMiddleware, searchJobs);

// GET /api/jobs/research?company=...&profile_id=...
router.get('/research', authMiddleware, getCompanyResearch);

// GET /api/jobs/match-status?profile_id=...&job_key=...
router.get('/match-status', authMiddleware, getMatchStatus);

module.exports = router;

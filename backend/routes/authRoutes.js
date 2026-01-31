const express = require('express');
const { signup, login, googleAuth, me, logout } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

module.exports = router;





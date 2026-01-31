const { z } = require('zod');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id ? user._id.toString() : user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function signup(req, res) {
  try {
    const parsed = signupSchema.parse(req.body);
    const emailKey = parsed.email.toLowerCase();

    const existingUser = await User.findOne({ email: emailKey });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(parsed.password, 10);
    const user = await User.create({
      name: parsed.name,
      email: emailKey,
      passwordHash,
      provider: 'local',
    });

    const token = signToken(user);

    // Set httpOnly cookie (no domain set = works for localhost)
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // false for localhost HTTP
      sameSite: 'lax', // Works for same-site requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/', // Available for all paths
    });

    res.json({
      token, // Still return token for backward compatibility
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        provider: user.provider,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: error.message || 'Signup failed' });
  }
}

async function login(req, res) {
  try {
    const parsed = loginSchema.parse(req.body);
    const emailKey = parsed.email.toLowerCase();

    const user = await User.findOne({ email: emailKey });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.provider !== 'local') {
      return res.status(400).json({ error: 'Use Google Sign-In for this account' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);

    // Set httpOnly cookie (no domain set = works for localhost)
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // false for localhost HTTP
      sameSite: 'lax', // Works for same-site requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/', // Available for all paths
    });

    res.json({
      token, // Still return token for backward compatibility
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        provider: user.provider,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Login failed' });
  }
}

async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken required' });
    }

    if (!googleClient) {
      return res.status(500).json({ error: 'Google OAuth not configured (set GOOGLE_CLIENT_ID)' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }

    const emailKey = payload.email.toLowerCase();
    let user = await User.findOne({ email: emailKey });

    if (!user) {
      // Create new user
      user = await User.create({
        name: payload.name || 'Google User',
        email: emailKey,
        provider: 'google',
        picture: payload.picture,
        googleId: payload.sub,
      });
    } else {
      // Update existing user if needed
      if (user.provider !== 'google') {
        // If user exists with local auth, update to google
        user.provider = 'google';
        user.googleId = payload.sub;
        if (payload.picture) user.picture = payload.picture;
        await user.save();
      } else {
        // Update picture if changed
        if (payload.picture && user.picture !== payload.picture) {
          user.picture = payload.picture;
          await user.save();
        }
      }
    }

    const token = signToken(user);

    // Set httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      token, // Still return token for backward compatibility
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        provider: user.provider,
        picture: user.picture,
      },
    });
  } catch (error) {
    console.error('[Auth] Google auth failed', error);
    res.status(401).json({ error: 'Google authentication failed: ' + error.message });
  }
}

function logout(req, res) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out successfully' });
}

async function me(req, res) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const emailKey = req.user.email.toLowerCase();
    const user = await User.findOne({ email: emailKey });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        provider: user.provider,
        picture: user.picture,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

module.exports = {
  signup,
  login,
  googleAuth,
  me,
  logout,
};





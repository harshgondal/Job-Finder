const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: function() {
      return this.provider === 'local';
    },
  },
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  },
  picture: {
    type: String,
    default: null,
  },
  googleId: {
    type: String,
    default: null,
  },
  resume: {
    filename: String,
    originalName: String,
    path: String,
    uploadedAt: Date,
    profileId: String,
  },
  resumeProfile: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  recentJobs: {
    type: [
      new mongoose.Schema(
        {
          id: { type: String, default: null },
          title: { type: String, required: true, trim: true },
          company: { type: String, required: true, trim: true },
          location: { type: String, default: null, trim: true },
          externalUrl: { type: String, default: null, trim: true },
          postedAt: { type: String, default: null },
          source: { type: String, default: null, trim: true },
          capturedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    default: [],
  },
  resumeRefinement: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  interests: {
    type: [String],
    default: [],
  },
  preferences: {
    experienceLevel: { type: String, default: null },
    workModes: { type: [String], default: [] },
    employmentTypes: { type: [String], default: [] },
    companySizes: { type: [String], default: [] },
    companyTypes: { type: [String], default: [] },
    includeCompanies: { type: [String], default: [] },
    excludeCompanies: { type: [String], default: [] },
    notes: { type: String, default: null },
    lastUpdatedAt: { type: Date, default: null },
    lastAnswers: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  jobEmailScheduleEnabled: {
    type: Boolean,
    default: false,
  },
  jobEmailScheduleLastRunAt: {
    type: Date,
    default: null,
  },
  jobEmailScheduleLastError: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

// Index for faster email lookups
userSchema.index({ email: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;





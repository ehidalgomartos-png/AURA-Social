const LEVELS = new Set(['normal', 'sensitive', 'nudity']);
const STATUSES = new Set(['published', 'under_review', 'rejected']);

function validateContentLevel(level) {
  return LEVELS.has(level);
}

function canViewerSee({ postLevel, viewer }) {
  if (postLevel === 'normal') return { allowed: true, blurred: false };

  if (!viewer) {
    return { allowed: false, blurred: true, reason: 'login_required' };
  }

  if (!viewer.ageVerified) {
    return { allowed: false, blurred: true, reason: 'age_verification_required' };
  }

  if (!viewer.showSensitive) {
    return { allowed: false, blurred: true, reason: 'sensitive_content_disabled' };
  }

  return { allowed: true, blurred: false };
}

module.exports = {
  LEVELS,
  STATUSES,
  validateContentLevel,
  canViewerSee
};

export default {
  // Web (browser) should use HttpOnly cookie only; mobile can use body fallback.
  allowBodyRefreshToken: false, // set true only for mobile apps
  maxActiveSessionsPerUser: 10, // cap device abuse
  sessionTtlDays: 30, // refresh token lifetime
  // Add any additional security configurations here
  enableTwoFactorAuth: false, // enable 2FA for all users
  passwordComplexity: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },
};

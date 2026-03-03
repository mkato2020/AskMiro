// ============================================================
// ✅ AskMiro Ops — config.js  (SAFE + INTEL-READY)
// - Uses ONE API base (no hardcoded URLs scattered across modules)
// - NO secrets committed
// ============================================================
window.CFG = {
  API_BASE: 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec',
  APP_VERSION: '1.0.0',
  MIN_MARGIN_PCT: 20,

  // auth storage keys
  TOKEN_KEY: 'askmiro_ops_token',
  USER_KEY: 'askmiro_ops_user',

  // intel defaults (optional)
  INTEL: {
    POLL_MS: 50,
    MAX_MS: 6000
  }
};

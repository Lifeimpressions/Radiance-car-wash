// Paste your own Supabase details here (Supabase > Project Settings > API).
// The "anon public" key is safe to publish. NEVER put the "service_role" key here.
window.RCW_CONFIG = {
   SUPABASE_URL: 'https://abcdefgh.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...',

  // Customers log in with a mobile number. Supabase needs an email address
  // behind the scenes, so the app builds one as <mobile>@<this domain>.
  // Leave empty to use your Supabase project's own address (recommended).
  LOGIN_EMAIL_DOMAIN: ''
};

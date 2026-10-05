// Paste your own Supabase details here (Supabase > Project Settings > API).
// The "anon public" key is safe to publish. NEVER put the "service_role" key here.
window.RCW_CONFIG = {
   SUPABASE_URL: 'https://soignlovteyzztdllwvh.supabase.co/rest/v1/',
   SUPABASE_ANON_KEY: 'sb_publishable_dfBcBIeashDUdtGrogQaaQ_vipKzWck',

  // Customers log in with a mobile number. Supabase needs an email address
  // behind the scenes, so the app builds one as <mobile>@<this domain>.
  // Leave empty to use your Supabase project's own address (recommended).
  LOGIN_EMAIL_DOMAIN: ''
};

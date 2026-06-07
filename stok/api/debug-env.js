module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    GEMINI_API_KEY:          !!process.env.GEMINI_API_KEY,
    SUPABASE_URL:            !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV:                process.env.NODE_ENV,
    total_env_keys:          Object.keys(process.env).length,
  });
};

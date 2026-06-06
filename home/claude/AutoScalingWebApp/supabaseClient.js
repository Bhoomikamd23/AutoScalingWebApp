const { createClient } = require('@supabase/supabase-js');

// 🔑 Replace these with your actual Supabase project credentials
// Found at: https://supabase.com/dashboard → your project → Settings → API
const supabaseUrl = 'https://ebexokvdkzxqrvqudisw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZXhva3Zka3p4cXJ2cXVkaXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDEyNjUsImV4cCI6MjA5MzgxNzI2NX0.nULuy6nFlzFpvzw8aMEN28ccJ1XJSg07Ezwc_YZKQ1w';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;

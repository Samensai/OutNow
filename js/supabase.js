// js/supabase.js
var SUPABASE_URL = "https://ivpgtkvyjnwkivcegmej.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2cGd0a3Z5am53a2l2Y2VnbWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzAwNDUsImV4cCI6MjA5MTE0NjA0NX0.cJvrRd4CNjY_b3Ejdmn3605hAqQheJEoFBfceINY0g0";
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
var currentUser = null;
var currentProfile = null;

// /src/supabase.js
import { createClient } from "@supabase/supabase-js";
//import { config } from "./config-legacy.js";
import config from "./config/index.js";

function assertEnv(name, val) {
  const v = (val ?? "").toString().trim();
  if (!v)
    throw new Error(
      `Missing ${name}. Set it in .env(.development/.production).`
    );
  return v;
}

const SUPABASE_URL = assertEnv("SUPABASE_URL", config.SUPABASE_URL);
const SERVICE_ROLE = assertEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
  config.SUPABASE_SERVICE_ROLE_KEY
);

// Server-side admin client (service role). Never expose this to the client.
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// Minimal readiness probe (no data changes)
export async function pingSupabase() {
  try {
    const { error } = await supabaseAdmin.auth.getSession();
    return !error;
  } catch {
    return false;
  }
}

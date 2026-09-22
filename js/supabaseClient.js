// Supabase-JS direkt vom CDN laden - kein npm install nötig.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("DEIN-PROJEKT") &&
  !SUPABASE_ANON_KEY.includes("DEIN-ANON-KEY");

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

import {timedSupabaseFetch} from "../utils/report-read-timing.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not defined");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined");
}

if (!supabaseAnonKey) {
  throw new Error("SUPABASE_ANON_KEY is not defined");
}

/**
 * Privileged server-side client.
 *
 * Use this for database operations that the backend
 * performs on behalf of the application.
 *
 * NEVER expose this client/key to the frontend.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  global: {fetch: timedSupabaseFetch},
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/**
 * Authentication client.
 *
 * Use this for login and validating user access tokens.
 * It must remain separate from supabaseAdmin.
 */
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  global: {fetch: (input,init)=>{
    // A stalled getUser request must not hold the shared authorization-read
    // gate forever and block every subsequent navigation. Verification still
    // fails closed; login/password mutations keep their existing behavior.
    const method=(init?.method??(input instanceof Request?input.method:"GET")).toUpperCase();
    if(method!=="GET")return timedSupabaseFetch(input,init);
    const inherited=init?.signal??(input instanceof Request?input.signal:undefined);
    const deadline=AbortSignal.timeout(10_000);
    return timedSupabaseFetch(input,{...init,signal:inherited?AbortSignal.any([inherited,deadline]):deadline});
  }},
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/** Request-local password confirmation. Never mutate the shared login client. */
export function createPasswordVerificationClient() {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
  });
}

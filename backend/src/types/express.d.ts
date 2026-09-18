import { User } from "@supabase/supabase-js";
import { ProfileRow } from "../models/profile.model.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      profile?: ProfileRow;
    }
  }
}

export {};
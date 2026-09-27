import { User } from "@supabase/supabase-js";
import { ProfileRow } from "../models/profile.model.js";

type AuthenticatedUser = User & {
  role?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      profile?: ProfileRow;
    }
  }
}

export {};

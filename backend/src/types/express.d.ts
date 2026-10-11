import { User } from "@supabase/supabase-js";
import { ProfileRow } from "../models/profile.model.js";

type AuthenticatedUser = User & {
  role?: string;
};

type AuthenticatedAppSession = {
  profileId: string;
  role: string;
  sessionId: string | null;
  expiresAt?: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      profile?: ProfileRow;
      appSession?: AuthenticatedAppSession;
    }
  }
}

export {};

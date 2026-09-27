export type UserRole = "ADMIN" | "STAFF" | "TRUCKER" | "UNKNOWN";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

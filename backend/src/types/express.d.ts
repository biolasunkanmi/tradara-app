import type { UserRole } from "../ai/tools/types";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        storeId?: string;
        permissions?: string[];
        email?: string;
        name?: string;
      };
    }
  }
}
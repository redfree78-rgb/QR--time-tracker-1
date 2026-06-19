import "express-session";

declare module "express-session" {
  interface SessionData {
    accountId: number;
    username: string;
    role: "admin" | "staff";
    displayName: string;
  }
}

import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Every request this limiter allows through spends a hit against the real
// LinkedIn account behind LI_AT_COOKIE, so this stays deliberately strict
// regardless of how many distinct clients call the public API.
export const linkedinRateLimiter = rateLimit({
  windowMs: 60_000,
  max: env.linkedinRateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. This API is intentionally throttled to protect the backing LinkedIn account." },
});

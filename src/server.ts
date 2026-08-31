import express from "express";
import { env } from "./config/env";
import { requireApiKey } from "./middleware/apiKey";
import { linkedinRateLimiter } from "./middleware/rateLimiter";
import { profileRouter } from "./routes/profile";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", requireApiKey, linkedinRateLimiter, profileRouter);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`linkedin-profile-api listening on port ${env.port}`);
});

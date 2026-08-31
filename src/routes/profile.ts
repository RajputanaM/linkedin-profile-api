import { Router } from "express";
import { extractPublicIdentifier, InvalidProfileUrlError } from "../linkedin/urlUtils";
import { fetchProfileHtml, LinkedInAuthError, ProfileNotFoundError } from "../linkedin/mwliteClient";
import { parseProfileHtml } from "../linkedin/parseProfile";

export const profileRouter = Router();

profileRouter.post("/profile", async (req, res) => {
  const { url } = req.body ?? {};

  if (typeof url !== "string" || url.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty string field 'url'." });
    return;
  }

  let publicIdentifier: string;
  try {
    publicIdentifier = extractPublicIdentifier(url);
  } catch (err) {
    if (err instanceof InvalidProfileUrlError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  try {
    const html = await fetchProfileHtml(publicIdentifier);
    const profile = parseProfileHtml(html, publicIdentifier);
    res.status(200).json(profile);
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof LinkedInAuthError) {
      res.status(502).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("Unexpected error fetching profile:", err);
    res.status(500).json({ error: "Unexpected error fetching profile." });
  }
});

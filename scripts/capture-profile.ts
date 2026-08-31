/**
 * Dev-only helper: fetches the raw Voyager profileView payload for a given
 * public identifier and writes it to captured-<identifier>.json so we can
 * inspect the real field shapes and refine src/linkedin/parseProfile.ts
 * against actual data instead of guessing.
 *
 * Usage:
 *   npm run capture -- <publicIdentifier>
 * (publicIdentifier is the slug from linkedin.com/in/<publicIdentifier>/)
 *
 * Requires LI_AT_COOKIE and JSESSIONID to be set in .env first.
 */
import { writeFileSync } from "fs";
import { fetchProfileView } from "../src/linkedin/voyagerClient";

async function main() {
  const publicIdentifier = process.argv[2];
  if (!publicIdentifier) {
    console.error("Usage: npm run capture -- <publicIdentifier>");
    process.exit(1);
  }

  const data = await fetchProfileView(publicIdentifier);
  const outPath = `captured-${publicIdentifier}.json`;
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote raw payload to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

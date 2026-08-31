/**
 * Dev-only helper: fetches the raw mwlite profile HTML for a given public
 * identifier and writes it to captured-<identifier>.html so we can inspect
 * real markup and refine src/linkedin/parseProfile.ts against actual data.
 *
 * Usage:
 *   npm run capture -- <publicIdentifier>
 * (publicIdentifier is the slug from linkedin.com/in/<publicIdentifier>/)
 *
 * Requires LI_AT_COOKIE and JSESSIONID to be set in .env first.
 */
import { writeFileSync } from "fs";
import { fetchProfileHtml } from "../src/linkedin/mwliteClient";
import { parseProfileHtml } from "../src/linkedin/parseProfile";

async function main() {
  const publicIdentifier = process.argv[2];
  if (!publicIdentifier) {
    console.error("Usage: npm run capture -- <publicIdentifier>");
    process.exit(1);
  }

  const html = await fetchProfileHtml(publicIdentifier);
  const outPath = `captured-${publicIdentifier}.html`;
  writeFileSync(outPath, html);
  console.log(`Wrote raw HTML to ${outPath}`);

  const parsed = parseProfileHtml(html, publicIdentifier);
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

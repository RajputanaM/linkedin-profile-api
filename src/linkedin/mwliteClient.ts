import { AxiosError } from "axios";
import { getLinkedInClient } from "./session";

export class LinkedInAuthError extends Error {
  constructor() {
    super(
      "LinkedIn did not return a profile page (likely redirected to a login/checkpoint page). The li_at/JSESSIONID cookies have probably expired and need to be refreshed manually."
    );
    this.name = "LinkedInAuthError";
  }
}

export class ProfileNotFoundError extends Error {
  constructor(publicIdentifier: string) {
    super(
      `No profile found for "${publicIdentifier}" (it may not exist, be private, or be outside your account's visible network).`
    );
    this.name = "ProfileNotFoundError";
  }
}

// Confirmed by direct testing: LinkedIn's lightweight "mwlite" profile page
// is fully server-rendered HTML (meta tag `data-app-id="profile-ssr-frontend"`)
// containing the actual profile data, served to requests with a mobile
// User-Agent (see session.ts). This single GET replaces what would otherwise
// require reverse-engineering LinkedIn's newer SDUI screen protocol.
export async function fetchProfileHtml(publicIdentifier: string): Promise<string> {
  const client = getLinkedInClient();

  let html: string;
  try {
    const response = await client.get(
      `/mwlite/profile/in/${encodeURIComponent(publicIdentifier)}`
    );
    html = response.data;
  } catch (err) {
    // Invalid/expired cookies typically bounce between login/checkpoint
    // redirects until axios' redirect cap is hit, rather than resolving to a
    // clean login page we could inspect for the meta-tag check below.
    if ((err as AxiosError).code === "ERR_FR_TOO_MANY_REDIRECTS") {
      throw new LinkedInAuthError();
    }
    throw err;
  }

  // A successful profile render always carries this meta tag. Its absence
  // means we were redirected to a login/checkpoint page instead (expired or
  // invalid session cookies) rather than getting the profile.
  if (!html.includes('content="p_mwlite_profile_view"')) {
    throw new LinkedInAuthError();
  }

  if (!html.includes('class="text-color-text heading-large"')) {
    throw new ProfileNotFoundError(publicIdentifier);
  }

  return html;
}

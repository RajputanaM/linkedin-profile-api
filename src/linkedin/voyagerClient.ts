import { AxiosError } from "axios";
import { getVoyagerClient } from "./session";

export class LinkedInAuthError extends Error {
  constructor(status: number) {
    super(
      `LinkedIn rejected the request (status ${status}). The li_at/JSESSIONID cookies have likely expired and need to be refreshed manually.`
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

// Combined payload: summary, positions, education, skills, certifications,
// languages, and profile picture in one JSON:API-style graph. Shape is
// intentionally loose (`unknown`) — see parseProfile.ts for how it's read.
export async function fetchProfileView(
  publicIdentifier: string
): Promise<unknown> {
  const client = getVoyagerClient();

  try {
    const response = await client.get(
      `/voyager/api/identity/profiles/${encodeURIComponent(publicIdentifier)}/profileView`
    );
    return response.data;
  } catch (err) {
    const status = (err as AxiosError).response?.status;
    if (status === 401 || status === 403) {
      throw new LinkedInAuthError(status);
    }
    if (status === 404) {
      throw new ProfileNotFoundError(publicIdentifier);
    }
    throw err;
  }
}

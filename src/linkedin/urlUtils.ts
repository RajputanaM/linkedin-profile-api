const PROFILE_URL_PATTERN =
  /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)\/?/i;

export class InvalidProfileUrlError extends Error {
  constructor(url: string) {
    super(`Not a recognizable LinkedIn profile URL: ${url}`);
    this.name = "InvalidProfileUrlError";
  }
}

export function extractPublicIdentifier(rawUrl: string): string {
  const match = rawUrl.trim().match(PROFILE_URL_PATTERN);
  if (!match) {
    throw new InvalidProfileUrlError(rawUrl);
  }
  return decodeURIComponent(match[1]);
}

import axios, { AxiosInstance } from "axios";
import { env } from "../config/env";

// LinkedIn serves a lightweight, fully server-rendered "mwlite" profile page
// when it detects a mobile browser. Confirmed by direct testing: this exact
// User-Agent causes LinkedIn to return `profile-ssr-frontend` HTML with the
// profile data already embedded, rather than the desktop SDUI app shell.
// Do not change this without re-verifying against a live request.
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";

let cachedClient: AxiosInstance | null = null;

export function getLinkedInClient(): AxiosInstance {
  if (cachedClient) return cachedClient;

  const jsessionId = env.jsessionId.startsWith('"')
    ? env.jsessionId
    : `"${env.jsessionId}"`;

  cachedClient = axios.create({
    baseURL: "https://www.linkedin.com",
    timeout: 15_000,
    maxRedirects: 5,
    headers: {
      cookie: `li_at=${env.liAtCookie}; JSESSIONID=${jsessionId}`,
      "user-agent": MOBILE_USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    validateStatus: (status) => status < 500,
  });

  return cachedClient;
}

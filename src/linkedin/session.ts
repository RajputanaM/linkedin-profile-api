import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { env } from "../config/env";

const LINKEDIN_ORIGIN = "https://www.linkedin.com";

// LinkedIn's own frontend echoes the (unquoted) JSESSIONID value back as the
// csrf-token header on every Voyager call. Without a matching pair, Voyager
// endpoints respond 401/403 even with a valid li_at cookie.
function csrfTokenFromJsessionId(jsessionId: string): string {
  return jsessionId.replace(/"/g, "");
}

let cachedClient: AxiosInstance | null = null;

export function getVoyagerClient(): AxiosInstance {
  if (cachedClient) return cachedClient;

  const jar = new CookieJar();
  const jsessionIdCookieValue = env.jsessionId.startsWith('"')
    ? env.jsessionId
    : `"${env.jsessionId}"`;

  jar.setCookieSync(`li_at=${env.liAtCookie}; Domain=.linkedin.com; Path=/; Secure; HttpOnly`, LINKEDIN_ORIGIN);
  jar.setCookieSync(`JSESSIONID=${jsessionIdCookieValue}; Domain=.linkedin.com; Path=/; Secure`, LINKEDIN_ORIGIN);

  const client = wrapper(
    axios.create({
      baseURL: LINKEDIN_ORIGIN,
      jar,
      withCredentials: true,
      timeout: 15_000,
      headers: {
        "csrf-token": csrfTokenFromJsessionId(env.jsessionId),
        "x-restli-protocol-version": "2.0.0",
        "x-li-lang": "en_US",
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    })
  );

  cachedClient = client;
  return client;
}

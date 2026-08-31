# LinkedIn Profile API

A hosted HTTPS API that takes a LinkedIn profile URL and returns structured JSON
(name, headline, location, about, current company, experience, education, skills,
certifications, languages, connection info, and profile/background images).

It works by directly calling LinkedIn's own internal **mwlite** (mobile web
lite) endpoint — a lightweight, fully server-rendered profile page LinkedIn
serves to mobile browsers — and parsing the returned HTML. No browser
automation (Selenium/Playwright/Puppeteer) is used anywhere; this is a plain
HTTP GET plus HTML parsing.

## How it works (approach)

LinkedIn's primary web app now renders profile pages through a proprietary
client-side "SDUI" (server-driven UI) screen protocol, which is not a plain
data endpoint and would require reverse-engineering an undocumented streaming
format. Instead, this service targets a simpler, confirmed-working surface:
LinkedIn's `mwlite` endpoint.

```
GET https://www.linkedin.com/mwlite/profile/in/{publicIdentifier}
```

This page is served with `<meta id="config" data-app-id="profile-ssr-frontend" ...>`
— i.e. it's **server-side rendered**: the complete HTML response already
contains the profile's data (name, headline, experience, education, skills,
etc.) baked into semantic markup. No JavaScript execution is needed to see
it, which is what makes a plain HTTP client sufficient.

Two things matter for LinkedIn to actually serve this lightweight version
instead of redirecting to the full desktop app:
1. **Session cookies** (`li_at` + `JSESSIONID`) from a logged-in account.
2. **A mobile User-Agent.** LinkedIn decides which experience to render based
   on the client's User-Agent; this was confirmed by direct testing — a
   desktop UA does not reliably get routed to `mwlite`. [src/linkedin/session.ts](src/linkedin/session.ts)
   pins a specific mobile Chrome/Android UA string for this reason. Don't
   change it without re-verifying against a live request.

[src/linkedin/parseProfile.ts](src/linkedin/parseProfile.ts) then parses that HTML with `cheerio`
(a jQuery-style HTML parser — still not a browser) using CSS-selector-based
field extraction, cross-checked against a real captured profile page.

**Why we don't automate login.** Automating LinkedIn's login form is one of
the most heavily monitored actions on the platform (CAPTCHA / "unusual
activity" checkpoints), especially from a server/datacenter IP. Instead, this
service expects you to log in manually once in a normal browser and hand it
the resulting session cookies as secrets — see Setup below. It never stores
or touches your password.

## API

### `POST /api/profile`

**Headers**
| Header | Required | Description |
|---|---|---|
| `x-api-key` | yes | Must match the `API_KEY` configured on the server. |
| `Content-Type` | yes | `application/json` |

**Body**
```json
{ "url": "https://www.linkedin.com/in/some-person/" }
```

**Response `200`** (fields are `null`/empty when not present on the profile)
```json
{
  "publicIdentifier": "some-person",
  "name": "Jane Doe",
  "headline": "Senior Engineer at Example Co.",
  "location": "San Francisco, California, United States",
  "about": null,
  "currentCompany": "Example Co.",
  "connectionDegree": "2nd",
  "connectionsCount": "500+ connections",
  "profileImageUrl": "https://media.licdn.com/...",
  "backgroundImageUrl": "https://media.licdn.com/...",
  "experience": [
    {
      "title": "Senior Engineer",
      "company": "Example Co.",
      "location": "San Francisco, CA",
      "startDate": "Mar 2021",
      "endDate": "Present",
      "description": "..."
    }
  ],
  "education": [
    {
      "school": "State University",
      "degree": "B.S.",
      "field": "Computer Science",
      "grade": "3.9",
      "startDate": null,
      "endDate": null
    }
  ],
  "skills": ["TypeScript", "Distributed Systems"],
  "certifications": [
    { "name": "AWS Certified Solutions Architect", "issuer": "AWS", "issueDate": null }
  ],
  "languages": [{ "name": "English", "proficiency": "Native or bilingual" }]
}
```

**Errors**
| Status | Meaning |
|---|---|
| `400` | Missing/malformed `url`, or not a recognizable `linkedin.com/in/...` URL |
| `401` | Missing/invalid `x-api-key` |
| `404` | Profile not found, private, or outside your account's visible network |
| `429` | Our own rate limit tripped (see "Protecting the account" below) |
| `502` | LinkedIn rejected the request — `li_at`/`JSESSIONID` have likely expired |

**Example**
```bash
curl -X POST https://<your-deployed-url>/api/profile \
  -H "x-api-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.linkedin.com/in/some-person/"}'
```

### `GET /health`
Liveness check, no auth required. Returns `{"status":"ok"}`.

## Setup

### 1. Get your LinkedIn session cookies (one-time, manual)

1. Log into linkedin.com in a normal browser with your own account.
2. Open DevTools → Application (Chrome) or Storage (Firefox) → Cookies →
   `https://www.linkedin.com`.
3. Copy the value of `li_at`.
4. Copy the value of `JSESSIONID` (it includes surrounding double quotes, e.g.
   `"ajax:1234567890123456789"` — keep them).

These become `LI_AT_COOKIE` and `JSESSIONID` below. They expire after some
months of inactivity; if the API starts returning `502`s, repeat this step.

### 2. Configure environment

```bash
cp .env.example .env
# then fill in LI_AT_COOKIE, JSESSIONID, and set your own API_KEY
```

### 3. Install and run locally

```bash
npm install
npm run dev        # runs src/server.ts with auto-reload
```

### 4. (Optional) Capture a real profile to sanity-check the parser

LinkedIn's mwlite markup isn't documented and can drift. This script fetches
the raw HTML for one profile, saves it locally, and prints the parsed JSON so
you can compare against [src/linkedin/parseProfile.ts](src/linkedin/parseProfile.ts)'s selectors:

```bash
npm run capture -- <publicIdentifier>   # the slug from linkedin.com/in/<publicIdentifier>
```

### 5. Build and run with Docker

```bash
docker build -t linkedin-profile-api .
docker run -p 3000:3000 --env-file .env linkedin-profile-api
```

### 6. Deploy

Deploy the Docker image to a host that supports always-on containers (e.g.
Railway or Fly.io). Set `LI_AT_COOKIE`, `JSESSIONID`, `API_KEY`, and
`LINKEDIN_RATE_LIMIT_PER_MINUTE` as environment variables/secrets on the
platform — never commit them.

## Protecting the LinkedIn account behind this API

Every request this service serves spends a hit against a real, personal
LinkedIn account. To keep that account safe:

- The endpoint is gated behind `x-api-key` — it isn't an open scraping proxy.
- An in-process rate limiter (`LINKEDIN_RATE_LIMIT_PER_MINUTE`, default 6/min)
  caps outbound calls to LinkedIn regardless of how many clients call the API.
- Outbound requests use a consistent, realistic mobile browser User-Agent to
  match the traffic pattern LinkedIn's own mobile web users generate.

## Known limitations

- **Cookie expiry is manual to fix.** There's no automated login/refresh by
  design (see "Why we don't automate login" above) — when `li_at`/`JSESSIONID`
  expire, someone has to repeat the manual capture step.
- **Data completeness depends on your account's relationship to the target
  profile.** LinkedIn shows more detail to 1st/2nd-degree connections; some
  fields may come back `null` or empty for distant or restricted profiles.
- **Two sections are best-effort / unverified against real markup:** "About"
  and "Languages". The test profile used to build this parser had neither
  filled in, so their selectors in [src/linkedin/parseProfile.ts](src/linkedin/parseProfile.ts) follow the
  same structural conventions LinkedIn uses elsewhere on the page but haven't
  been confirmed against a real example. If you hit a profile with either
  section populated, run the capture script and adjust the selectors if
  needed.
- **Profiles without a custom photo** return LinkedIn's shared placeholder
  asset URL for `profileImageUrl`/`backgroundImageUrl` rather than `null` —
  this mirrors what a real viewer would see.
- **The mwlite markup is undocumented and can change** without notice; if
  fields start coming back empty, recapture a live profile and diff against
  the current selectors.
- **No CAPTCHA/2FA/checkpoint handling.** If the account behind the cookies
  gets flagged, that has to be resolved manually in a browser.
- **Rate limits are intentionally conservative**, prioritizing account safety
  over throughput.
- **This uses an undocumented, unofficial API surface.** LinkedIn's Terms of
  Service prohibit automated scraping; this project is built for this
  assignment's explicitly sanctioned use case (your own account, your own
  data access) and isn't intended as a general-purpose scraping tool.

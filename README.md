# LinkedIn Profile API

A hosted HTTPS API that takes a LinkedIn profile URL and returns structured JSON
(name, headline, location, about, experience, education, skills, certifications,
languages, profile images).

It works by directly calling LinkedIn's own internal "Voyager" REST API — the
same undocumented endpoints linkedin.com's web frontend calls when you view a
profile — rather than using a browser or any official LinkedIn API (there isn't
one that exposes this data for arbitrary profiles).

## How it works (approach)

LinkedIn's web app authenticates a browser session with two cookies (`li_at` and
`JSESSIONID`) and calls REST endpoints under `/voyager/api/...`, echoing the
`JSESSIONID` value back as a `csrf-token` header on every request. Once you hold
a valid `li_at` + `JSESSIONID` pair from a logged-in session, you can call those
same endpoints with plain HTTP requests — no browser required.

The core endpoint this service uses is:

```
GET https://www.linkedin.com/voyager/api/identity/profiles/{publicIdentifier}/profileView
```

This single call returns a combined payload — summary, positions, education,
skills, certifications, languages, and profile picture data — structured as a
flat, JSON:API-style entity graph (an `included[]` array of typed objects, each
tagged with a `$type`, rather than a nested tree). [src/linkedin/parseProfile.ts](src/linkedin/parseProfile.ts)
cross-references that graph by `$type` to build the clean response schema below.

**Why we don't automate login.** Automating LinkedIn's login form is the single
most heavily monitored action on the platform (CAPTCHA / "unusual activity"
checkpoints), especially from a server/datacenter IP. Instead, this service
expects you to log in manually once in a normal browser and hand it the
resulting session cookies as secrets — see Setup below. It never stores or
touches your password.

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

**Response `200`**
```json
{
  "publicIdentifier": "some-person",
  "name": "Jane Doe",
  "headline": "Senior Engineer at Example Co.",
  "location": "San Francisco, California, United States",
  "about": "...",
  "profileImageUrl": "https://media.licdn.com/...",
  "backgroundImageUrl": "https://media.licdn.com/...",
  "experience": [
    {
      "title": "Senior Engineer",
      "company": "Example Co.",
      "location": "San Francisco, CA",
      "startDate": "2021-03",
      "endDate": null,
      "description": "..."
    }
  ],
  "education": [
    {
      "school": "State University",
      "degree": "B.S.",
      "field": "Computer Science",
      "startDate": "2013",
      "endDate": "2017"
    }
  ],
  "skills": ["TypeScript", "Distributed Systems"],
  "certifications": [
    { "name": "AWS Certified Solutions Architect", "issuer": "AWS", "issueDate": "2022" }
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

### 4. (Optional) Capture a real payload to sanity-check the parser

LinkedIn's Voyager payload shape isn't documented and can drift. This script
fetches the raw response for one profile and saves it to a local JSON file so
you can compare it against [src/linkedin/parseProfile.ts](src/linkedin/parseProfile.ts)'s field
assumptions:

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
- Outbound requests use realistic browser-like headers (user-agent,
  accept-language) to blend in with normal traffic.

## Known limitations

- **Cookie expiry is manual to fix.** There's no automated login/refresh by
  design (see "Why we don't automate login" above) — when `li_at`/`JSESSIONID`
  expire, someone has to repeat the manual capture step.
- **Data completeness depends on your account's relationship to the target
  profile.** LinkedIn shows more detail to 1st/2nd-degree connections; some
  fields may come back `null` or empty for distant or restricted profiles.
- **The Voyager payload shape is undocumented and can change.** This service
  targets the `profileView` endpoint's shape as currently observed; if
  LinkedIn migrates a section to its newer GraphQL surface, that section may
  come back empty until [src/linkedin/parseProfile.ts](src/linkedin/parseProfile.ts) is updated against a
  fresh captured payload (see Setup step 4).
- **No CAPTCHA/2FA/checkpoint handling.** If the account behind the cookies
  gets flagged, that has to be resolved manually in a browser.
- **Rate limits are intentionally conservative**, prioritizing account safety
  over throughput.
- **This uses an undocumented, unofficial API surface.** LinkedIn's Terms of
  Service prohibit automated scraping; this project is built for this
  assignment's explicitly sanctioned use case (your own account, your own
  data access) and isn't intended as a general-purpose scraping tool.

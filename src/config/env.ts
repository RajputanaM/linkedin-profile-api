import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  liAtCookie: required("LI_AT_COOKIE"),
  jsessionId: required("JSESSIONID"),
  apiKey: required("API_KEY"),
  port: Number(process.env.PORT ?? 3000),
  linkedinRateLimitPerMinute: Number(
    process.env.LINKEDIN_RATE_LIMIT_PER_MINUTE ?? 6
  ),
};

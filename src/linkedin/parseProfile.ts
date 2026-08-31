/**
 * The Voyager `profileView` response is a JSON:API-style entity graph: a flat
 * `included[]` array of typed entities (each tagged with a `$type`), rather
 * than a nested object tree. This file cross-references those entities by
 * `$type` to build our clean, flat response schema.
 *
 * IMPORTANT: the exact field names here are based on the documented shape of
 * this (undocumented, reverse-engineered) endpoint and WILL need to be
 * checked/adjusted against a real captured payload — see
 * `scripts/capture-profile.ts` and the README "Approach" section. LinkedIn
 * changes these payloads without notice.
 */

interface VoyagerEntity {
  $type?: string;
  [key: string]: unknown;
}

export interface ParsedProfile {
  publicIdentifier: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  profileImageUrl: string | null;
  backgroundImageUrl: string | null;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  certifications: CertificationEntry[];
  languages: LanguageEntry[];
}

export interface ExperienceEntry {
  title: string | null;
  company: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export interface EducationEntry {
  school: string | null;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface CertificationEntry {
  name: string | null;
  issuer: string | null;
  issueDate: string | null;
}

export interface LanguageEntry {
  name: string | null;
  proficiency: string | null;
}

function getIncluded(raw: unknown): VoyagerEntity[] {
  const included = (raw as { included?: unknown })?.included;
  return Array.isArray(included) ? (included as VoyagerEntity[]) : [];
}

function entitiesOfType(entities: VoyagerEntity[], typeSuffix: string): VoyagerEntity[] {
  return entities.filter((e) => typeof e.$type === "string" && e.$type.endsWith(typeSuffix));
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function formatDate(dateObj: unknown): string | null {
  if (!dateObj || typeof dateObj !== "object") return null;
  const { month, year } = dateObj as { month?: number; year?: number };
  if (!year) return null;
  return month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
}

// LinkedIn image fields use a vector-image format: a root CDN URL plus a list
// of resolution "artifacts". We pick the highest-resolution artifact available.
function resolveImageUrl(imageField: unknown): string | null {
  const vectorImage = (imageField as any)?.displayImageReference?.vectorImage ?? (imageField as any)?.vectorImage;
  if (!vectorImage?.rootUrl || !Array.isArray(vectorImage.artifacts)) return null;

  const best = [...vectorImage.artifacts].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  )[0];
  if (!best?.fileIdentifyingUrlPathSegment) return null;

  return `${vectorImage.rootUrl}${best.fileIdentifyingUrlPathSegment}`;
}

export function parseProfileView(raw: unknown, publicIdentifier: string): ParsedProfile {
  const included = getIncluded(raw);

  const profileEntity = entitiesOfType(included, "identity.profile.Profile")[0];
  const positions = entitiesOfType(included, "identity.profile.Position");
  const educations = entitiesOfType(included, "identity.profile.Education");
  const skills = entitiesOfType(included, "identity.profile.Skill");
  const certifications = entitiesOfType(included, "identity.profile.Certification");
  const languages = entitiesOfType(included, "identity.profile.Language");

  const firstName = str(profileEntity?.firstName);
  const lastName = str(profileEntity?.lastName);
  const name = firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : null;

  return {
    publicIdentifier,
    name,
    headline: str(profileEntity?.headline),
    location: str(profileEntity?.geoLocationName) ?? str(profileEntity?.locationName),
    about: str(profileEntity?.summary),
    profileImageUrl: resolveImageUrl(profileEntity?.profilePicture),
    backgroundImageUrl: resolveImageUrl(profileEntity?.backgroundImage),
    experience: positions.map((p) => ({
      title: str(p.title),
      company: str(p.companyName),
      location: str(p.locationName),
      startDate: formatDate((p as any).dateRange?.start ?? (p as any).timePeriod?.startDate),
      endDate: formatDate((p as any).dateRange?.end ?? (p as any).timePeriod?.endDate),
      description: str(p.description),
    })),
    education: educations.map((e) => ({
      school: str(e.schoolName),
      degree: str(e.degreeName),
      field: str(e.fieldOfStudy),
      startDate: formatDate((e as any).dateRange?.start ?? (e as any).timePeriod?.startDate),
      endDate: formatDate((e as any).dateRange?.end ?? (e as any).timePeriod?.endDate),
    })),
    skills: skills.map((s) => str(s.name)).filter((v): v is string => v !== null),
    certifications: certifications.map((c) => ({
      name: str(c.name),
      issuer: str(c.authority),
      issueDate: formatDate((c as any).timePeriod?.startDate ?? (c as any).dateRange?.start),
    })),
    languages: languages.map((l) => ({
      name: str(l.name),
      proficiency: str(l.proficiency),
    })),
  };
}

import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { Element } from "domhandler";

/**
 * Parses LinkedIn's "mwlite" server-rendered profile HTML. Field selectors
 * below were derived from a real captured page (see scripts/capture-profile.ts)
 * for a profile that had: name/headline/company/location, full experience,
 * education, skills, and certifications/publications under "Accomplishments".
 *
 * Two sections are best-effort / UNVERIFIED against real markup because the
 * test profile didn't have them filled in: "About" and "Languages". Their
 * selectors follow the same structural conventions LinkedIn uses elsewhere on
 * this page, but should be re-checked against a profile that actually has
 * those sections before relying on them.
 */

export interface ParsedProfile {
  publicIdentifier: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  currentCompany: string | null;
  connectionDegree: string | null;
  connectionsCount: string | null;
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
  grade: string | null;
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

function textOrNull($el: Cheerio<Element>): string | null {
  const text = $el.first().text().trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : null;
}

// Start-date spans in this markup embed the range separator inside the same
// element, e.g. `<span>Feb 2026\n-\n</span><span>Present</span>`, so the
// collapsed text comes back as "Feb 2026 -". Strip the trailing separator.
function stripTrailingDash(text: string | null): string | null {
  if (!text) return text;
  const stripped = text.replace(/\s*-\s*$/, "").trim();
  return stripped.length > 0 ? stripped : null;
}

function findSectionByHeading($: CheerioAPI, heading: string): Cheerio<Element> | null {
  let found: Cheerio<Element> | null = null;
  $("section").each((_, el) => {
    const $el = $(el);
    const h2Text = $el.children("h2").first().text().trim();
    if (h2Text === heading) {
      found = $el;
      return false;
    }
    return undefined;
  });
  return found;
}

function parseHeader($: CheerioAPI): {
  name: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  connectionDegree: string | null;
  connectionsCount: string | null;
} {
  const nameEl = $("h1.heading-large").first();
  const header = nameEl.closest("div.bg-color-background-container.mx-2.mt-2.mb-1");

  const name = textOrNull(nameEl);
  const connectionDegree = textOrNull(header.find('span[title$="degree connection"]'));
  const headline = textOrNull(header.find("> div.body-small.text-color-text > span").first());
  const currentCompany = textOrNull(header.find("span.member-current-company"));
  const connectionsCount = textOrNull(header.find("span.whitespace-nowrap"));

  const locationDivs = header.find("> div.body-small.text-color-text-low-emphasis");
  let location: string | null = null;
  locationDivs.each((_, el) => {
    const $el = $(el);
    if ($el.find(".member-current-company").length === 0) {
      const clone = $el.clone();
      clone.find(".whitespace-nowrap, .dot-separator").remove();
      location = clone.text().trim().replace(/\s+/g, " ") || null;
    }
  });

  return { name, headline, location, currentCompany, connectionDegree, connectionsCount };
}

function parseAbout($: CheerioAPI): string | null {
  // UNVERIFIED: no real profile with an About section was available while
  // building this. Falls back to "all text in the section besides the
  // heading" since that's the pattern LinkedIn uses for most other sections.
  const section = findSectionByHeading($, "About");
  if (!section) return null;
  const clone = section.clone();
  clone.children("h2").remove();
  clone.find("button").remove();
  return textOrNull(clone as Cheerio<Element>);
}

function parseImages($: CheerioAPI): { profileImageUrl: string | null; backgroundImageUrl: string | null } {
  const profileImageUrl =
    $("#profile-picture-container img").first().attr("data-delayed-url") ?? null;
  const backgroundImageUrl =
    $('img[aria-label="Member Background Photo"]').first().attr("data-delayed-url") ?? null;
  return { profileImageUrl, backgroundImageUrl };
}

function parseExperience($: CheerioAPI): ExperienceEntry[] {
  const section = findSectionByHeading($, "Experience");
  if (!section) return [];

  const entries: ExperienceEntry[] = [];

  section.find("> ol > li.profile-entity-lockup").each((_, companyLi) => {
    const $companyLi = $(companyLi);
    const company = textOrNull($companyLi.find("> a .list-item-heading span").first());

    const roles = $companyLi.find(".entity-lockup-border > ul > li.role-container");
    if (roles.length === 0) {
      // Single-role company with no nested role list in some layouts.
      entries.push({
        title: company,
        company,
        location: null,
        startDate: null,
        endDate: null,
        description: null,
      });
      return;
    }

    roles.each((__, roleLi) => {
      const $role = $(roleLi);
      const title = textOrNull($role.find(".body-small-bold span").first());
      const dateSpans = $role.find("div.body-small.text-color-text > span.body-small");
      const startDate = stripTrailingDash(textOrNull(dateSpans.eq(0)));
      const endDate = textOrNull(dateSpans.eq(1));
      const location = textOrNull($role.find(".text-xs.text-color-text-low-emphasis span").first());
      const description = textOrNull($role.find(".description").first());

      entries.push({ title, company, location, startDate, endDate, description });
    });
  });

  return entries;
}

function parseEducation($: CheerioAPI): EducationEntry[] {
  const section = findSectionByHeading($, "Education");
  if (!section) return [];

  const entries: EducationEntry[] = [];

  section.find("> ol > li").each((_, li) => {
    const $li = $(li);
    const school = textOrNull($li.find(".list-item-heading span").first());

    const degreeFieldSpans = $li.find("div.body-small.text-color-text > span");
    const degree = textOrNull(degreeFieldSpans.eq(0));
    const field = textOrNull(degreeFieldSpans.eq(2)); // index 1 is the dot-separator

    const grade = textOrNull($li.find('div.body-small.mt-1.text-color-text span[dir="ltr"]').first());

    // UNVERIFIED: dates weren't populated on the test profile's education
    // entry. Attempting the same two-span pattern used for experience dates.
    const dateSpans = $li.find("div.body-small.text-color-text-low-emphasis span.body-small");
    const startDate = stripTrailingDash(textOrNull(dateSpans.eq(0)));
    const endDate = textOrNull(dateSpans.eq(1));

    entries.push({ school, degree, field, grade, startDate, endDate });
  });

  return entries;
}

function parseSkills($: CheerioAPI): string[] {
  const skills: string[] = [];
  $(".skills-list .skill-item span[dir='ltr']").each((_, el) => {
    const text = textOrNull($(el));
    if (text) skills.push(text);
  });
  return skills;
}

function parseAccomplishmentList(
  $: CheerioAPI,
  sectionClass: string
): { name: string | null; detail: string | null; date: string | null }[] {
  const results: { name: string | null; detail: string | null; date: string | null }[] = [];
  $(`.accomplishment-type.${sectionClass} ul > li.sub-list-item`).each((_, li) => {
    const $li = $(li);
    const name = textOrNull($li.find(".list-item-heading").first());
    const detail = textOrNull($li.find(".description").first());
    const date = textOrNull($li.find(".date").first());
    results.push({ name, detail, date });
  });
  return results;
}

function parseCertifications($: CheerioAPI): CertificationEntry[] {
  return parseAccomplishmentList($, "certifications-section").map((c) => ({
    name: c.name,
    issuer: c.detail,
    issueDate: c.date,
  }));
}

function parseLanguages($: CheerioAPI): LanguageEntry[] {
  // UNVERIFIED: the test profile had no Languages entries. This assumes the
  // same "accomplishment-type" structure used for Certifications/Publications
  // (class would be "languages-section") — confirm against a real profile
  // that lists languages and adjust if the class name or field mapping differs.
  return parseAccomplishmentList($, "languages-section").map((l) => ({
    name: l.name,
    proficiency: l.detail,
  }));
}

export function parseProfileHtml(html: string, publicIdentifier: string): ParsedProfile {
  const $ = cheerio.load(html);

  const header = parseHeader($);
  const { profileImageUrl, backgroundImageUrl } = parseImages($);

  return {
    publicIdentifier,
    name: header.name,
    headline: header.headline,
    location: header.location,
    about: parseAbout($),
    currentCompany: header.currentCompany,
    connectionDegree: header.connectionDegree,
    connectionsCount: header.connectionsCount,
    profileImageUrl,
    backgroundImageUrl,
    experience: parseExperience($),
    education: parseEducation($),
    skills: parseSkills($),
    certifications: parseCertifications($),
    languages: parseLanguages($),
  };
}

export type ScreenKind = "app" | "marketing";

export type PlannedScreen = {
  id: string;
  name: string;
  focus: string;
  kind: ScreenKind;
};

type Rule = { name: string; pattern: RegExp; focus: string };

/**
 * Marketing / portfolio / website briefs. Detected FIRST so a portfolio brief that
 * happens to mention "projects" is never mistaken for a task-management app.
 */
const MARKETING_SIGNALS =
  /\bportfolio\b|\bpersonal (?:site|website)\b|\blanding page\b|\bmarketing (?:site|website)\b|\bagency (?:site|website)\b|\bcase stud(?:y|ies)\b|\bfreelancer?\b|\bresume\b|\bcv\b|\bphotograph(?:y|er)\b|\bdesigner (?:site|website|portfolio)\b|\bblog\b|\bwebsite\b/i;

const APP_SIGNALS =
  /\btodo\b|\bto-do\b|\btask\b|\bdashboard\b|\bkanban\b|\bcrm\b|\badmin panel\b|\bsaas (?:app|application|dashboard)\b|\bproject management\b|\bweb app\b|\bapplication\b/i;

const MARKETING_RULES: Rule[] = [
  { name: "Home", pattern: /\bhome(?:page)?\b|\bhero\b|\blanding\b|\bportfolio\b|\bwebsite\b/i, focus: "An arresting hero with a clear positioning statement, selected work preview, credibility proof, and one primary call to action." },
  { name: "Work", pattern: /\bwork\b|\bprojects?\b|\bportfolio\b|\bgallery\b|\bcase stud(?:y|ies)\b/i, focus: "A curated work index: filterable project cards with role, year, discipline, outcome, and strong editorial rhythm." },
  { name: "Case Study", pattern: /\bcase stud(?:y|ies)\b|\bproject (?:detail|page)\b|\bwork detail\b/i, focus: "A long-form project story: context, role, process, decisions, results with real metrics, and next-project navigation." },
  { name: "About", pattern: /\babout\b|\bbio\b|\bstory\b|\bresume\b|\bcv\b/i, focus: "A personal narrative with portrait-scale identity block, experience timeline, skills, tools, and recognition." },
  { name: "Services", pattern: /\bservices?\b|\boffering?s\b|\bwhat i do\b/i, focus: "Clearly scoped services with deliverables, process steps, engagement models, and pricing signals." },
  { name: "Blog", pattern: /\bblog\b|\bwriting\b|\barticles?\b|\bjournal\b/i, focus: "An editorial index with featured article, reading time, topic tags, and calm typographic hierarchy." },
  { name: "Contact", pattern: /\bcontact\b|\bget in touch\b|\bhire me\b|\benquiry\b/i, focus: "A confident contact page: short qualifying form with validation-ready fields, availability, response time, and direct channels." },
  { name: "Testimonials", pattern: /\btestimonials?\b|\breviews?\b|\bclients?\b/i, focus: "Named client testimonials with roles, logos as text marks, and outcome-led quotes." },
  { name: "Pricing", pattern: /\bpricing\b|\brates?\b|\bpackages?\b/i, focus: "Comparable packages with decisive hierarchy, transparent inclusions, and one recommended option." },
];

const APP_RULES: Rule[] = [
  { name: "Dashboard", pattern: /\bdashboard\b|\boverview\b/i, focus: "Executive overview, primary metrics, recent work, and the most useful immediate action." },
  { name: "All Tasks", pattern: /\ball tasks\b|\btask list\b/i, focus: "Dense searchable task list with filters, sorting, bulk selection, pagination, and clear row actions." },
  { name: "Today", pattern: /\btoday(?:'s)?\b/i, focus: "Today's schedule grouped by time or priority, fast completion controls, and quick add." },
  { name: "Upcoming", pattern: /\bupcoming\b|\bfuture tasks\b/i, focus: "Future work organized as a date-led timeline with deadlines and importance cues." },
  { name: "Completed", pattern: /\bcompleted\b|\bcompletion history\b/i, focus: "Completion history with dates, search, filtering, and restore actions." },
  { name: "Projects", pattern: /\bcategories?\b|\bprojects?\b/i, focus: "Project collection with task counts, progress, owners, and create/edit management controls." },
  { name: "Task Details", pattern: /\btask details?\b|\bsubtasks?\b|\bactivity\/history\b/i, focus: "A focused task workspace with metadata, description, subtasks, notes, attachments, and activity." },
  { name: "Calendar", pattern: /\bcalendar\b|\bmonthly\b.*\bweekly\b/i, focus: "A legible month calendar with view switching, scheduled tasks, deadline cues, and a compact agenda." },
  { name: "Analytics", pattern: /\banalytics\b|\bproductivity statistics\b|\bproductivity trends\b/i, focus: "Decision-useful productivity trends, completion rate, category mix, and clean accessible charts." },
  { name: "Settings", pattern: /\bsettings\b|\bnotification preferences\b|\bappearance\/theme\b/i, focus: "Profile, appearance, notification, task-default, and export preferences in a calm settings layout." },
  { name: "Add Task", pattern: /\badd task\b|\btask creation\b|\bcreate task\b/i, focus: "Polished creation dialog or page with validation-ready fields, recurrence, tags, subtasks, reminders, and attachments." },
  { name: "Profile", pattern: /\buser profile\b|\bprofile (?:page|section|settings)\b/i, focus: "Professional profile details, identity, role, activity context, and account actions." },
  { name: "Sign In", pattern: /\bsign[ -]?in\b|\blog[ -]?in\b/i, focus: "Focused, trustworthy sign-in experience with clear validation and recovery actions." },
  { name: "Sign Up", pattern: /\bsign[ -]?up\b|\bregister\b/i, focus: "Focused account creation with progressive disclosure, validation, and trust cues." },
  { name: "Pricing", pattern: /\bpricing\b|\bplans?\b.*\btiers?\b/i, focus: "Comparable plans, decisive hierarchy, transparent feature differences, and one recommended tier." },
  { name: "Kanban", pattern: /\bkanban\b|\bboard with\b.*\bcolumns?\b/i, focus: "Drag-ready workflow columns, dense task cards, ownership, status, and board controls." },
];

export function detectScreenKind(prompt: string): ScreenKind {
  const marketing = MARKETING_SIGNALS.test(prompt);
  const app = APP_SIGNALS.test(prompt);
  if (marketing && !app) return "marketing";
  if (!marketing && app) return "app";
  if (marketing && app) {
    // Both present: whichever signal appears first in the brief wins.
    const m = prompt.search(MARKETING_SIGNALS);
    const a = prompt.search(APP_SIGNALS);
    return m <= a ? "marketing" : "app";
  }
  return "app";
}

function slugify(value: string, index: number) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `${slug}-${index + 1}` : `screen-${index + 1}`;
}

export function planProductScreens(prompt: string): PlannedScreen[] {
  const kind = detectScreenKind(prompt);
  const rules = kind === "marketing" ? MARKETING_RULES : APP_RULES;

  const matches = rules.filter((rule) => rule.pattern.test(prompt));
  const unique = matches.filter((rule, index) => matches.findIndex((item) => item.name === rule.name) === index);

  if (unique.length === 0) {
    const fallbackName = kind === "marketing" ? "Home" : /mobile|app/i.test(prompt) ? "Primary Experience" : "Main Screen";
    return [
      {
        id: slugify(fallbackName, 0),
        name: fallbackName,
        focus: "The primary experience requested in the brief, with complete realistic content and clear hierarchy.",
        kind,
      },
    ];
  }

  return unique.slice(0, 12).map((rule, index) => ({
    id: slugify(rule.name, index),
    name: rule.name,
    focus: rule.focus,
    kind,
  }));
}

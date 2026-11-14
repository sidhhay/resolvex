/**
 * The classification taxonomy.
 *
 * This module is the single contract shared by every classification strategy:
 *  • the LLM strategies are handed `CATEGORY_LABELS` as an enum and their answer
 *    is rejected unless it is one of them;
 *  • the keyword strategy scores the same list with the rules below;
 *  • `departmentSlug` matches `departments.slug` in db/seed.sql, which is how a
 *    predicted category becomes a routed department.
 *
 * Adding a category means adding one entry here and one row in `departments`.
 */

/** @typedef {'low' | 'medium' | 'high' | 'urgent'} Priority */

/**
 * @typedef {Object} CategoryDefinition
 * @property {string} label            Human label; identical to the department name.
 * @property {string} departmentSlug   Foreign key into `departments.slug`.
 * @property {string[]} keywords       Ordinary signals, weight 1.
 * @property {RegExp[]} [strongSignals] Decisive phrases, weight 3.
 * @property {Priority} [basePriority] Floor priority for anything in this category.
 */

/** @type {ReadonlyArray<CategoryDefinition>} */
export const CATEGORIES = Object.freeze([
  {
    label: 'Discipline & Anti-Harassment',
    departmentSlug: 'discipline',
    basePriority: 'urgent',
    keywords: [
      'harassment', 'harassed', 'ragging', 'bullying', 'bullied', 'abuse', 'abusive',
      'threat', 'threatened', 'misconduct', 'discrimination', 'caste', 'racist',
      'assault', 'molest', 'stalking', 'intimidation', 'retaliation', 'unsafe',
    ],
    strongSignals: [
      /\bsexual\s+harassment\b/i,
      /\bragging\b/i,
      /\bthreaten(?:ed|ing)?\s+(?:me|us|students?)\b/i,
      /\b(?:caste|gender|religious)\s+discrimination\b/i,
    ],
  },
  {
    label: 'Health & Medical',
    departmentSlug: 'health',
    basePriority: 'high',
    keywords: [
      'medical', 'doctor', 'clinic', 'dispensary', 'ambulance', 'first aid', 'injury',
      'injured', 'illness', 'fever', 'infection', 'medicine', 'health centre',
      'health center', 'emergency', 'hospital', 'nurse',
    ],
    strongSignals: [/\bambulance\b/i, /\bmedical\s+emergency\b/i, /\bhealth\s+cent(?:re|er)\b/i],
  },
  {
    label: 'Examination & Evaluation',
    departmentSlug: 'examination',
    keywords: [
      'exam', 'examination', 'marks', 'grade', 'grades', 'grading', 'result', 'results',
      'revaluation', 'recheck', 'rechecking', 'answer sheet', 'internal assessment',
      'hall ticket', 'admit card', 'invigilator', 'backlog', 'supplementary', 'transcript',
      'cgpa', 'sgpa', 'moderation',
    ],
    strongSignals: [
      /\b(?:internal|external)\s+(?:marks|assessment)\b/i,
      /\bre-?valuation\b/i,
      /\banswer\s+(?:sheet|script)\b/i,
      /\bhall\s+ticket\b/i,
    ],
  },
  {
    label: 'Academics',
    departmentSlug: 'academics',
    keywords: [
      'lecture', 'lectures', 'class', 'classes', 'syllabus', 'curriculum', 'faculty',
      'professor', 'teacher', 'teaching', 'course', 'assignment', 'attendance',
      'timetable', 'time table', 'practical', 'lab session', 'project guide',
      'supervisor', 'elective', 'credit', 'academic',
    ],
    strongSignals: [
      /\bnot\s+(?:taking|conducting)\s+(?:the\s+)?class(?:es)?\b/i,
      /\bsyllabus\s+(?:not\s+)?complet(?:e|ed|ion)\b/i,
      /\battendance\s+(?:shortage|record|marked)\b/i,
    ],
  },
  {
    label: 'Hostel & Residence',
    departmentSlug: 'hostel',
    keywords: [
      'hostel', 'dorm', 'dormitory', 'room', 'roommate', 'warden', 'mess', 'canteen',
      'food', 'meal', 'kitchen', 'laundry', 'bed', 'accommodation', 'residence',
      'curfew', 'common room', 'drinking water', 'geyser', 'hot water',
    ],
    strongSignals: [
      /\bhostel\s+(?:room|mess|warden|block)\b/i,
      /\bmess\s+(?:food|quality|timing|bill)\b/i,
      /\bdrinking\s+water\b/i,
    ],
  },
  {
    label: 'Sanitation & Housekeeping',
    departmentSlug: 'sanitation',
    keywords: [
      'sanitation', 'cleaning', 'cleaned', 'clean', 'dirty', 'garbage', 'trash', 'waste',
      'dustbin', 'bin', 'hygiene', 'unhygienic', 'washroom', 'toilet', 'restroom',
      'pest', 'mosquito', 'cockroach', 'rodent', 'stink', 'smell', 'sewage', 'drainage',
      'housekeeping', 'sweeper',
    ],
    strongSignals: [
      /\b(?:washroom|toilet|restroom)s?\s+(?:are|is|not)\b/i,
      /\bgarbage\s+(?:not\s+)?(?:collected|piling|overflow)/i,
      /\bpest\s+control\b/i,
    ],
  },
  {
    label: 'Infrastructure & Maintenance',
    departmentSlug: 'infrastructure',
    keywords: [
      'electricity', 'power', 'power cut', 'light', 'lights', 'bulb', 'fan', 'ac',
      'air conditioner', 'leak', 'leaking', 'leakage', 'seepage', 'broken', 'damaged',
      'repair', 'maintenance', 'furniture', 'chair', 'desk', 'bench', 'door', 'window',
      'lift', 'elevator', 'plumbing', 'tap', 'pipe', 'wiring', 'short circuit',
      'construction', 'civil', 'roof', 'wall',
    ],
    strongSignals: [
      /\b(?:power|electricity)\s+(?:cut|failure|outage)\b/i,
      /\b(?:water|pipe|roof)\s+leak(?:age|ing)?\b/i,
      /\bshort\s+circuit\b/i,
      /\b(?:lift|elevator)\s+(?:not\s+working|out\s+of\s+order|broken)\b/i,
    ],
  },
  {
    label: 'IT & Network Services',
    departmentSlug: 'it-services',
    keywords: [
      'wifi', 'wi-fi', 'internet', 'network', 'lan', 'router', 'server', 'portal',
      'website', 'login', 'password', 'account locked', 'erp', 'lms', 'moodle',
      'email', 'computer', 'laptop', 'software', 'printer', 'projector', 'bandwidth',
      'connectivity', 'vpn', 'system',
    ],
    strongSignals: [
      /\bwi-?fi\b/i,
      /\b(?:student|university|college)\s+portal\b/i,
      /\b(?:cannot|can't|unable to)\s+log\s?in\b/i,
      /\binternet\s+(?:is\s+)?(?:down|slow|not\s+working)\b/i,
    ],
  },
  {
    label: 'Library',
    departmentSlug: 'library',
    keywords: [
      'library', 'librarian', 'book', 'books', 'journal', 'reading room', 'issue',
      'return', 'renewal', 'fine', 'catalogue', 'catalog', 'e-resource', 'reference',
      'periodical', 'stack',
    ],
    strongSignals: [/\breading\s+room\b/i, /\blibrary\s+(?:book|fine|card|timing)\b/i],
  },
  {
    label: 'Transport',
    departmentSlug: 'transport',
    keywords: [
      'bus', 'buses', 'shuttle', 'transport', 'driver', 'route', 'pickup', 'drop',
      'parking', 'vehicle', 'cab', 'commute', 'bus pass', 'stop',
    ],
    strongSignals: [/\bbus\s+(?:route|timing|pass|driver|stop)\b/i, /\bparking\s+(?:space|slot|fee)\b/i],
  },
  {
    label: 'Accounts & Finance',
    departmentSlug: 'accounts',
    keywords: [
      'fee', 'fees', 'payment', 'refund', 'scholarship', 'stipend', 'receipt', 'invoice',
      'bill', 'billing', 'account', 'transaction', 'reimbursement', 'due', 'dues',
      'charged', 'overcharged', 'deposit', 'caution money',
    ],
    strongSignals: [
      /\b(?:fee|tuition)\s+(?:refund|receipt|payment|structure)\b/i,
      /\bscholarship\s+(?:not\s+)?(?:credited|disbursed|received)\b/i,
      /\bdouble\s+charged\b/i,
    ],
  },
  {
    // Terminal fallback. `general` must always exist in `departments`.
    label: 'General Administration',
    departmentSlug: 'general',
    keywords: ['administration', 'office', 'certificate', 'document', 'id card', 'bonafide', 'general'],
  },
]);

/** Enum handed to the LLM strategies; the model may answer with nothing else. */
export const CATEGORY_LABELS = Object.freeze(CATEGORIES.map((c) => c.label));

/** The category used whenever nothing else matches. */
export const FALLBACK_CATEGORY = /** @type {CategoryDefinition} */ (
  CATEGORIES[CATEGORIES.length - 1]
);

/** @type {ReadonlyArray<Priority>} */
export const PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

/**
 * Phrases that raise urgency regardless of which department ends up owning the
 * complaint — a leaking pipe and a harassment report are routed very
 * differently but both need to jump the queue.
 * @type {ReadonlyArray<{ pattern: RegExp, priority: Priority }>}
 */
const PRIORITY_SIGNALS = Object.freeze([
  { pattern: /\b(?:emergency|urgent|immediately|life[- ]threatening|danger(?:ous)?)\b/i, priority: 'urgent' },
  { pattern: /\b(?:electrocut|fire|gas leak|collapse|flood)\w*\b/i, priority: 'urgent' },
  { pattern: /\b(?:no|without)\s+(?:drinking\s+)?water\b/i, priority: 'high' },
  { pattern: /\b(?:power|electricity)\s+(?:cut|outage|failure)\b/i, priority: 'high' },
  { pattern: /\b(?:several|many|multiple)\s+(?:days|weeks)\b/i, priority: 'high' },
  { pattern: /\b(?:deadline|exam|examination)\s+\w*\s*(?:tomorrow|today|approaching)\b/i, priority: 'high' },
  { pattern: /\b(?:minor|small|whenever possible|not urgent|suggestion)\b/i, priority: 'low' },
]);

/**
 * @param {string} label
 * @returns {CategoryDefinition | undefined}
 */
export function findCategoryByLabel(label) {
  const needle = String(label ?? '').trim().toLowerCase();
  return CATEGORIES.find((c) => c.label.toLowerCase() === needle);
}

/**
 * @param {string} slug
 * @returns {CategoryDefinition | undefined}
 */
export function findCategoryBySlug(slug) {
  const needle = String(slug ?? '').trim().toLowerCase();
  return CATEGORIES.find((c) => c.departmentSlug === needle);
}

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isKnownCategory(label) {
  return Boolean(findCategoryByLabel(label));
}

/**
 * @param {Priority} a
 * @param {Priority} b
 * @returns {Priority} whichever of the two is more severe.
 */
export function maxPriority(a, b) {
  return PRIORITIES.indexOf(a) >= PRIORITIES.indexOf(b) ? a : b;
}

/**
 * Rule-based urgency detection, applied on top of whatever a strategy returned.
 * @param {string} text
 * @param {Priority} [base]
 * @returns {Priority}
 */
export function inferPriority(text, base = 'medium') {
  let priority = base;
  let sawExplicitLow = false;
  for (const signal of PRIORITY_SIGNALS) {
    if (!signal.pattern.test(text)) continue;
    if (signal.priority === 'low') sawExplicitLow = true;
    else priority = maxPriority(priority, signal.priority);
  }
  // "minor"/"suggestion" only demotes when nothing urgent was also detected.
  if (sawExplicitLow && priority === base && base === 'medium') return 'low';
  return priority;
}

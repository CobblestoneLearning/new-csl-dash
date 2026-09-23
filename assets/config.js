/* ===================================================================
   COBBLESTONE LEARNING · REPOSITORY HUB (v2) — configuration
   -------------------------------------------------------------------
   Everything here is data, not logic. Two independent dimensions:

     TYPE     what a repo IS   (plugin / theme / snippet / app / site)
              -> drives the colour in every chart and on the Map.
     PURPOSE  what a repo is FOR (reporting / authoring / ...)
              -> drives the Staff-view sections.

   Both resolve from GitHub topics first (so the repo stays the source
   of truth), then from CURATED, then from a description heuristic.
   Add a `cat-<id>` topic on GitHub OR a CURATED line — either works.
   =================================================================== */

var AUTH_CONFIG = {
  clientId: 'Ov23liHyPVBdzXg8TOYS',
  /* The callback lives at the ORIGIN ROOT and is owned by the
     cobblestonelearning.github.io repo. GitHub pins an OAuth app to one
     callback URL, and this hub is served from a sub-path of the same
     origin — so we deliberately reuse the root callback rather than
     shipping our own copy. postMessage is origin-checked either way. */
  redirectPath: '/callback.html',
  exchangeUrl: 'https://cobblestone-oauth.cobblestonelearning.workers.dev',
  scope: 'read:org repo'
};

var ACCOUNT = 'cobblestonelearning';

/* ---------- Types (fixed colour order — never cycled) ---------- */
var TYPES = [
  { id: 'plugin',  label: 'Plugins',       plural: 'WordPress plugins',  color: '#0072B2', tint: '#E6F1F8' },
  { id: 'snippet', label: 'Snippets',      plural: 'site snippets',      color: '#5BB8EC', tint: '#EAF6FD' },
  { id: 'theme',   label: 'Themes',        plural: 'WordPress themes',   color: '#D48200', tint: '#FBF1E2' },
  { id: 'app',     label: 'Apps & tools',  plural: 'apps and tools',     color: '#00916A', tint: '#E3F4EF' },
  { id: 'site',    label: 'Sites & pages', plural: 'sites and pages',    color: '#C4719B', tint: '#F8EDF3' }
];
var TYPE_BY_ID = {};
TYPES.forEach(function (t) { TYPE_BY_ID[t.id] = t; });

/* ---------- Purposes (Staff-view sections, in display order) ---------- */
var PURPOSES = [
  { id: 'reporting',   label: 'Reporting & dashboards',
    blurb: 'Turning LMS activity into numbers people can act on.',
    icon: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>' },
  { id: 'authoring',   label: 'Course authoring & content',
    blurb: 'Building, packaging and publishing learning content.',
    icon: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>' },
  { id: 'translation', label: 'Translation & subtitles',
    blurb: 'Taking courses, captions and content into other languages.',
    icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
  { id: 'platform',    label: 'LMS platform & themes',
    blurb: 'The plugins and themes the learning sites are built from.',
    icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>' },
  { id: 'ops',         label: 'Operations & hosting',
    blurb: 'Keeping the sites fast, monitored and inside their limits.',
    icon: '<path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/><circle cx="12" cy="12" r="3.2"/>' },
  { id: 'tools',       label: 'Internal tools & utilities',
    blurb: 'Day-to-day utilities that save the team manual work.',
    icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
  { id: 'web',         label: 'Websites & pages',
    blurb: 'Public and internal web pages we host ourselves.',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' },
  { id: 'other',       label: 'Everything else',
    blurb: 'Not yet sorted — add a cat- topic on GitHub to file it.',
    icon: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' }
];
var PURPOSE_BY_ID = {};
PURPOSES.forEach(function (p) { PURPOSE_BY_ID[p.id] = p; });

/* Map a GitHub topic straight onto a purpose. */
var TOPIC_PURPOSE = {
  'cat-reporting': 'reporting',   'reporting': 'reporting',
  'cat-authoring': 'authoring',   'cat-translation': 'translation',
  'cat-tools': 'tools',           'cat-web': 'web',
  'cat-ops': 'ops',               'hosting': 'ops',
  'cat-platform': 'platform',     'cat-theme': 'platform'
};

/* ---------- Platforms / integrations ("Works with") ----------
   Topic or keyword -> the display name staff recognise. Order here is
   the order of the coverage chart when counts tie. */
var PLATFORMS = [
  { id: 'wordpress',  label: 'WordPress',    topics: ['wordpress'],                      match: /wordpress|gutenberg|wpcode/i },
  { id: 'learndash',  label: 'LearnDash',    topics: ['learndash'],                      match: /learndash/i },
  { id: 'buddyboss',  label: 'BuddyBoss',    topics: ['buddyboss'],                      match: /buddyboss/i },
  { id: 'gutenberg',  label: 'Gutenberg',    topics: ['gutenberg'],                      match: /gutenberg|block editor/i },
  { id: 'tincanny',   label: 'Tin Canny',    topics: ['tin-canny'],                      match: /tin[ -]?canny/i },
  { id: 'woocommerce',label: 'WooCommerce',  topics: ['woocommerce'],                    match: /woocommerce/i },
  { id: 'automator',  label: 'Uncanny',      topics: ['uncanny-automator','uncanny-groups'], match: /uncanny/i },
  { id: 'scorm',      label: 'SCORM / xAPI', topics: ['scorm','xapi'],                   match: /scorm|xapi/i },
  { id: 'h5p',        label: 'H5P',          topics: ['h5p'],                            match: /h5p/i },
  { id: 'memberpress',label: 'MemberPress',  topics: ['memberpress'],                    match: /memberpress/i },
  { id: 'entra',      label: 'Entra ID',     topics: ['entra-id'],                       match: /entra|azure ad/i },
  { id: 'siteground', label: 'SiteGround',   topics: ['siteground'],                     match: /siteground/i },
  { id: 'deepl',      label: 'DeepL',        topics: ['deepl'],                          match: /deepl/i },
  { id: 'rise',       label: 'Articulate Rise', topics: ['articulate','rise'],           match: /articulate|rise 360|xliff/i },
  { id: 'stripe',     label: 'Stripe',       topics: ['stripe'],                         match: /stripe/i },
  { id: 'elementor',  label: 'Elementor',    topics: ['elementor'],                      match: /elementor/i },
  { id: 'github',     label: 'GitHub',       topics: ['github'],                         match: /github/i }
];

/* ---------- Client sites (snippet library facet) ----------
   Snippet repos are named csl-snippet-<site>-<thing> for site-specific
   work, or csl-snippet-<thing> for cross-site work. */
var SITES = [
  { id: 'onefamily',    label: 'One Family',    prefixes: ['onefamily'],       topics: ['onefamily'] },
  { id: 'hubnanog',     label: 'Hub na nÓg',    prefixes: ['hubnanog'],        topics: [] },
  { id: 'einn',         label: 'EINN',          prefixes: ['einn'],            topics: [] },
  { id: 'snnlearn',     label: 'SNNlearn',      prefixes: ['snnlearn'],        topics: [] },
  { id: 'timber-spec',  label: 'Timber Spec',   prefixes: ['timber-spec'],     topics: [] },
  { id: 'thinkquestions',label: 'ThinkQuestions',prefixes: ['thinkquestions'], topics: ['thinkquestions'] },
  { id: 'aic',          label: 'AIC (aviation)',prefixes: ['aic'],             topics: ['aviation'] },
  { id: 'hub',          label: 'Hub',           prefixes: ['hub'],             topics: [] }
];

/* ---------- Language colours ----------
   Deliberately NOT GitHub's palette: several of those (JS #f1e05a) fail
   contrast on white. These are the validated categorical slots reused
   for the language dimension, plus a neutral tail. */
var LANG_COLORS = {
  'PHP': '#0072B2', 'HTML': '#D48200', 'JavaScript': '#00916A',
  'CSS': '#C4719B', 'SCSS': '#5BB8EC', 'Python': '#6B7A8C',
  'Shell': '#8592A3', 'Go Template': '#A8B2BF', 'TypeScript': '#2F6FA8'
};
var LANG_ORDER = ['PHP', 'HTML', 'JavaScript', 'CSS', 'SCSS'];

/* GitHub mis-detects Cobblestone's single-file PHP snippets as "Hack"
   (both use <?hh-adjacent syntax heuristics). Fold it back into PHP so
   the composition chart tells the truth. */
var LANG_ALIASES = { 'Hack': 'PHP' };

/* ---------- Curated overrides ----------
   key = lowercased repo name. Any field is optional:
     type, purpose, summary (plain-language, staff-facing),
     works (extra integrations), demo (path to a self-contained
     HTML demo, loaded through the AUTHENTICATED contents API).
   Summaries are factual and internal — never marketing. */
var CURATED = {
  /* --- Reporting & dashboards --- */
  'csl-reports-platform':      { type: 'plugin', purpose: 'reporting', summary: 'The main reporting dashboard: courses, learners, groups, quizzes, memberships, forms and SCORM in one place.' },
  'csl-ytd-reports':           { type: 'plugin', purpose: 'reporting', summary: 'Year-to-date LearnDash reporting for the Timber Spec / FII LMS, with month-end snapshots and a branded export.' },
  'cpd-hours-dashboard':       { type: 'plugin', purpose: 'reporting', summary: 'Tracks CPD hours for learners — course time, self-study logging and completion metrics.' },
  'csl-cpd-hours-dashboard':   { type: 'plugin', purpose: 'reporting', summary: 'The earlier standalone build of the CPD hours tracker.' },
  'cobblestone-custom-reports':{ type: 'plugin', purpose: 'reporting', summary: 'Customises the report columns and user data shown in the LMS admin.' },
  'cinematicreports':          { type: 'app',    purpose: 'reporting', summary: 'A cinematic 3D analytics dashboard for a LearnDash / BuddyBoss LMS.', demo: 'lms-observatory/observatory.html' },
  'cobblestone-gh-dashboard':  { type: 'app',    purpose: 'reporting', summary: 'A single-screen dashboard of this GitHub account, live from the API.', demo: 'index.html' },
  'bettersitegroundreports':   { type: 'app',    purpose: 'ops',       summary: 'A browser overlay that adds richer CPU and usage analytics to SiteGround hosting.' },

  /* --- Course authoring & content --- */
  'csl-gutenberg-blocks':      { type: 'plugin', purpose: 'authoring', summary: 'The custom block library used to build course pages in WordPress.' },
  'csl-block-builder':         { type: 'app',    purpose: 'authoring', summary: 'An AI-assisted production line that generates and previews new Gutenberg blocks.' },
  'learningjournal':           { type: 'app',    purpose: 'authoring', summary: 'Builds reflective learner journals to embed into LearnDash courses.', demo: 'learner-journal-builder_9.html' },
  'of-course-interactions':    { type: 'plugin', purpose: 'authoring', summary: 'Accordions, slideshows, flip cards and worksheets for One Family courses.' },
  'cbl-content-blocks':        { type: 'plugin', purpose: 'authoring', summary: 'Editor-managed content blocks for One Family, including the posts carousel.' },
  'parenting-tips':            { type: 'plugin', purpose: 'authoring', summary: 'The Parenting Information knowledge base — its post type and categories.' },
  'multi-lang-sco':            { type: 'app',    purpose: 'authoring', summary: 'A SCORM 1.2 package that delivers one course in several languages.' },
  'siem-package-multi-language': { type: 'app',  purpose: 'authoring', summary: 'The multi-language SCORM package used for SIEM training.' },

  /* --- Translation & subtitles --- */
  'deeplxliff':                { type: 'app', purpose: 'translation', summary: 'Translates Articulate Rise 360 XLIFF exports through the DeepL API, preserving the file structure.' },
  'rise-xliff-translator-v27': { type: 'app', purpose: 'translation', summary: 'The database-backed rebuild of the Rise course translator.' },
  'rise-xliff-translator-v26': { type: 'app', purpose: 'translation', summary: 'The original single-page Rise course translator.' },
  'subtitle-studio':           { type: 'app', purpose: 'translation', summary: 'Edit and translate video subtitles (VTT / SRT) in the browser.', demo: 'index.html' },

  /* --- LMS platform & themes --- */
  'csl-entra-sync':            { type: 'plugin', purpose: 'platform', summary: 'Makes Microsoft Entra ID the source of truth for LearnDash group membership, and handles compliance expiry.' },
  'cb-assessment-manager':     { type: 'plugin', purpose: 'platform', summary: 'Assessment records, secure documents, and certificate generation and delivery.' },
  'cb-reminder-mailer':        { type: 'plugin', purpose: 'platform', summary: 'Sends one-time LearnDash group completion reminders, in throttled batches.' },
  'csv-reminder-mailer':       { type: 'plugin', purpose: 'platform', summary: 'Sends reminder emails from imported CSV data and LearnDash completions.' },
  'clbb-member-privacy':       { type: 'plugin', purpose: 'platform', summary: 'Blocks logged-out visitors at server level and keeps member content private.' },
  'stripe-payment':            { type: 'plugin', purpose: 'platform', summary: 'Takes Stripe payments on a Cobblestone site.' },
  'scorm-scanner-plugin':      { type: 'plugin', purpose: 'platform', summary: 'Analyses every SCORM package uploaded through Tin Canny against its LearnDash course data.' },

  /* --- Operations & hosting --- */
  'csl-quota-monitor':         { type: 'plugin', purpose: 'ops', summary: 'Watches disk and inode usage against the SiteGround package and emails us before it bites.' },
  'mainwp-cobblestone-manager':{ type: 'plugin', purpose: 'ops', summary: 'Captures plugin and theme version changes across the network, with SiteGround quick links.' },
  'cbl-tincanny-accelerator':  { type: 'plugin', purpose: 'ops', summary: 'Handles Tin Canny’s high-volume SCORM autosave pings before WordPress boots, cutting each from 80–150ms to near zero.' },
  'tincanny_intercept':        { type: 'plugin', purpose: 'ops', summary: 'Speeds up Tin Canny LearnDash Reporting by intercepting its xAPI traffic.' },
  'csl-wpcode-snippets':       { type: 'app',    purpose: 'ops', summary: 'The full mirror of every active WPCode snippet on the SiteGround network. WPCode on each site stays the source of truth.' },

  /* --- Internal tools --- */
  'quizxml':                   { type: 'app', purpose: 'tools', summary: 'Compares LearnDash / WpProQuiz quiz exports and produces branded PDF and DOCX documents.', demo: 'cobblestone_quiz_comparator.html' },
  'quizformater':              { type: 'app', purpose: 'tools', summary: 'The earlier quiz comparator and formatter for LearnDash / WpProQuiz exports.', demo: 'cobblestone_quiz_comparator.html' },
  'chrome-scripts':            { type: 'app', purpose: 'tools', summary: 'Bookmarklets and DevTools scripts for everyday web operations.' },

  /* --- Websites & pages --- */
  'cobblestonelearning.github.io': { type: 'site', purpose: 'web', summary: 'The original repository hub — the page this one is replacing.' },
  'new-csl-dash':              { type: 'site', purpose: 'web', summary: 'This hub. The rebuilt repository dashboard, previewing in its own repo.' },
  'cobblestone-loader':        { type: 'site', purpose: 'web', summary: 'The 3D graduation-cap loading animation (pure HTML + CSS), as a reusable showcase.', demo: 'index.html' }
};

/* ---------- Boilerplate stripped from GitHub descriptions ---------- */
var DESC_BOILERPLATE = [
  /^A WordPress plugin by Cobblestone Learning\.\s*/i,
  /^A WordPress theme by Cobblestone Learning\.\s*/i,
  /^A (?:small |single-page |single-file, zero-build |self-contained, single-file |local\/private )?(?:web )?(?:app|tool|PHP-MVC app|browser tool)\s+by Cobblestone Learning\s*/i,
  /\s*by Cobblestone Learning\b/i
];

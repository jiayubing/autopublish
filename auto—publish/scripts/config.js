const path = require('path');

// In packaged mode, AUTO_PUBLISH_ROOT_DIR is set by desktop/runtime-paths.js
// to the writable workspace. In development it falls back to the project root.
const ROOT = process.env.AUTO_PUBLISH_WORKSPACE || process.env.AUTO_PUBLISH_ROOT_DIR || path.resolve(__dirname, '..');
const DATA_DIR = process.env.AUTO_PUBLISH_DATA_DIR || path.join(ROOT, 'data');
const PLAYWRIGHT_HOME = process.env.AUTO_PUBLISH_PLAYWRIGHT_HOME || path.join(ROOT, 'work', 'playwright-cli');

const DIRS = {
  rootDir: ROOT,
  inputDir: process.env.AUTO_PUBLISH_INPUT_DIR || path.join(ROOT, 'input'),
  publishedDir: process.env.AUTO_PUBLISH_PUBLISHED_DIR || path.join(ROOT, 'published'),
  failedDir: process.env.AUTO_PUBLISH_FAILED_DIR || path.join(ROOT, 'failed'),
  tmpDir: process.env.AUTO_PUBLISH_TMP_DIR || path.join(ROOT, 'tmp'),
  logsDir: process.env.AUTO_PUBLISH_LOGS_DIR || path.join(ROOT, 'logs'),
  dataDir: DATA_DIR,
  stateDir: process.env.AUTO_PUBLISH_PLAYWRIGHT_STATE_DIR || path.join(PLAYWRIGHT_HOME, 'state'),
};

const PW = {
  home: PLAYWRIGHT_HOME,
  session: 'autopublish',
  profileDir: process.env.AUTO_PUBLISH_PLAYWRIGHT_PROFILE_DIR || path.join(PLAYWRIGHT_HOME, 'profiles', 'autopublish'),
  daemonDir: path.join(PLAYWRIGHT_HOME, 'sessions', 'autopublish'),
  browserChannel: process.env.BROWSER_CHANNEL || 'msedge',
  headless: false,
};

const LIEJU = {
  base: 'https://ly.lieju.com',
  loginUrl: 'https://www.lieju.com/login/',
  publishUrl: 'https://post.lieju.com/117/239',
  selectors: {
    loginIndicator: 'a[href*="action=quit"]',
    titleInput: '[id=atc_title]',
    contentEditor: '[id=atc_content]',
    submitBtn: '[id=sub]',
    zoneSelect: '[id=atc_zone_id]',
    phoneInput: '[id=atc_mobphone]',
    contactInput: '[id=atc_linkman]',
    articleDir: 'lieju',
  },
};

// Runtime overrides are application-scoped and are injected before this
// module is loaded. Never read executable paths from the customer workspace.
const MARKITDOWN_CMD = process.env.MARKITDOWN_CMD || 'markitdown';
const PLAYWRIGHT_CLI_JS = process.env.PLAYWRIGHT_CLI_JS || 'playwright-cli';

module.exports = { DIRS, PW, LIEJU, MARKITDOWN_CMD, PLAYWRIGHT_CLI_JS };

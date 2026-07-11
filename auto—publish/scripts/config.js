const path = require('path');

// In packaged mode, AUTO_PUBLISH_ROOT_DIR is set by desktop/runtime-paths.js
// to the writable workspace. In development it falls back to the project root.
const ROOT = process.env.AUTO_PUBLISH_ROOT_DIR || path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const DIRS = {
  rootDir: ROOT,
  inputDir: path.join(ROOT, 'input'),
  publishedDir: path.join(ROOT, 'published'),
  failedDir: path.join(ROOT, 'failed'),
  tmpDir: path.join(ROOT, 'tmp'),
  logsDir: path.join(ROOT, 'logs'),
  dataDir: DATA_DIR,
  stateDir: path.join(ROOT, 'work', 'playwright-cli', 'state'),
};

const PW = {
  home: path.join(ROOT, 'work', 'playwright-cli'),
  session: 'autopublish',
  profileDir: path.join(ROOT, 'work', 'playwright-cli', 'profiles', 'autopublish'),
  daemonDir: path.join(ROOT, 'work', 'playwright-cli', 'sessions', 'autopublish'),
  browserChannel: 'msedge',
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

const MARKITDOWN_CMD = 'C:/Users/violet/AppData/Local/Programs/Python/Launcher/py.exe -m markitdown';
const PLAYWRIGHT_CLI_JS = 'C:/Users/violet/AppData/Roaming/npm/node_modules/@playwright/cli/playwright-cli.js';

module.exports = { DIRS, PW, LIEJU, MARKITDOWN_CMD, PLAYWRIGHT_CLI_JS };

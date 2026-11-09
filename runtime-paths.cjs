const path = require('node:path');
const APP_ROOT = __dirname;
const DATA_DIR = process.env.BILI_DATA_DIR || path.join(APP_ROOT, 'data');
const BIN_DIR = process.env.BILI_BIN_DIR || path.join(APP_ROOT, 'bin');
const CACHE_DIR = process.env.BILI_CACHE_DIR || BIN_DIR;
const MODEL_DIR = path.join(CACHE_DIR, 'models');
const DOWNLOAD_DIR = process.env.BILI_DOWNLOAD_DIR || path.join(APP_ROOT, 'downloads');
module.exports = { APP_ROOT, DATA_DIR, BIN_DIR, CACHE_DIR, MODEL_DIR, DOWNLOAD_DIR };

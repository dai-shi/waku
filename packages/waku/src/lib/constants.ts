export const EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'];

export const DEV_BUILD_ID = 'dev'; // truthy on purpose
export const SRC_CLIENT_ENTRY = 'waku.client';
export const SRC_SERVER_ENTRY = 'waku.server';
export const SRC_PAGES = 'pages'; // only for managed mode
export const SRC_MIDDLEWARE = 'middleware'; // only for managed mode

// Some file and dir names for dist
// We may change this in the future
export const DIST_PUBLIC = 'public';
export const DIST_SERVER = 'server';
export const BUILD_METADATA_FILE = '__waku_build_metadata.js';

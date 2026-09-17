import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

interface Config {
  port: number;
  grpcPort: number;
  bindHost: string;
  bindHostGrpc: string;
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  jwt: {
    secret: string;
    expiresIn?: string;
  };
  cors: {
    origin: string[];
    methods: string[];
  };
  logs: {
    level: string;
  };
  api: {
    prefix: string;
  };
}

const config: Config = {
  port: parseInt(process.env.BACK_PORT || '5700', 10),
  grpcPort: parseInt(process.env.GRPC_PORT || '5500', 10),
  bindHost: process.env.BIND_HOST || '::',
  bindHostGrpc: process.env.BIND_HOST_GRPC || '::',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  logs: {
    level: process.env.LOG_LEVEL || 'silly',
  },
  api: {
    prefix: '/api',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'whyour-secret',
    expiresIn: process.env.JWT_EXPIRES_IN,
  },
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
};

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.QL_DIR) {
  let qlHomePath = path.join(__dirname, '../../');
  if (qlHomePath.endsWith('/static/')) {
    qlHomePath = path.join(qlHomePath, '../');
  }
  process.env.QL_DIR = qlHomePath.replace(/\/$/g, '');
}


// Get and normalize QlBaseUrl
let baseUrl = process.env.QlBaseUrl || '';
if (baseUrl) {
  // Ensure it starts with /
  if (!baseUrl.startsWith('/')) {
    baseUrl = `/${baseUrl}`;
  }
  // Remove trailing slash for consistency in route definitions
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
}

const rootPath = process.env.QL_DIR as string;
const envFound = dotenv.config({ path: path.join(rootPath, '.env') });

let dataPath = path.join(rootPath, 'data/');

if (process.env.QL_DATA_DIR) {
  dataPath = process.env.QL_DATA_DIR.replace(/\/$/g, '');
}

const shellPath = path.join(rootPath, 'shell/');
const tmpPath = path.join(dataPath, '.tmp/');
const samplePath = path.join(rootPath, 'sample/');
const configPath = path.join(dataPath, 'config/');
const logPath = path.join(dataPath, 'log/');
const dbPath = path.join(dataPath, 'db/');
const uploadPath = path.join(dataPath, 'upload/');
const systemLogPath = path.join(dataPath, 'syslog/');


const versionFile = path.join(rootPath, 'version.yaml');

if (envFound.error && !process.env.JWT_SECRET) {
  throw new Error("⚠️  Couldn't find .env file  ⚠️");
}

export default {
  ...config,
  jwt: config.jwt,
  baseUrl,
  rootPath,
  tmpPath,
  dataPath,
  logPath,
  dbPath,
  uploadPath,
  configPath,
  samplePath,
  blackFileList: [
    'auth.json',
    'config.sh.sample',
    'cookie.sh',
    'crontab.list',
    'dependence-proxy.sh',
    'token.json',
    'grpc',
    '__pycache__',
  ],
  apiWhiteList: [
    '/api/user/login',
    '/api/health',
    '/open/auth/token',
    '/api/user/two-factor/login',
    '/api/system',
    '/api/user/init',
    '/api/user/notification/init',
    '/open/user/login',
    '/open/user/two-factor/login',
    '/open/system',
    '/open/user/init',
    '/open/user/notification/init',
  ],
  versionFile,
  systemLogPath,
  maxTokensPerPlatform: 10, // Maximum number of concurrent sessions per platform
};

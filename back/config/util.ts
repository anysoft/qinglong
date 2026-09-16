import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import psTreeFun from 'ps-tree';
import { promisify } from 'util';
import { load } from 'js-yaml';
import config from './index';
import Logger from '../loaders/logger';
import { writeFileWithLock } from '../shared/utils';
import { FormData } from 'undici';
import { maybeSudo } from './container';
import { resolveFileAccess } from '../shared/fileAccess';

export * from './share';

export async function getFileContentByName(fileName: string) {
  const _exsit = await fileExist(fileName);
  if (_exsit) {
    return await fs.readFile(fileName, 'utf8');
  }
  return '';
}

export function removeAnsi(text: string) {
  return text.replace(/\x1b\[\d+m/g, '');
}

export async function getLastModifyFilePath(dir: string) {
  let filePath = '';

  const _exsit = await fileExist(dir);
  if (_exsit) {
    const arr = await fs.readdir(dir);

    arr.forEach(async (item) => {
      const fullpath = path.join(dir, item);
      const stats = await fs.lstat(fullpath);
      if (stats.isFile()) {
        if (stats.mtimeMs >= 0) {
          filePath = fullpath;
        }
      }
    });
  }
  return filePath;
}

export function getToken(req: any) {
  const { authorization = '' } = req.headers;
  if (authorization && authorization.split(' ')[0] === 'Bearer') {
    return (authorization as string)
      .replace('Bearer ', '')
      .replace('mobile-', '')
      .replace('desktop-', '');
  }
  return '';
}

export function getPlatform(userAgent: string): 'mobile' | 'desktop' {
  const ua = userAgent.toLowerCase();
  const testUa = (regexp: RegExp) => regexp.test(ua);
  const testVs = (regexp: RegExp) =>
    (ua.match(regexp) || [])
      .toString()
      .replace(/[^0-9|_.]/g, '')
      .replace(/_/g, '.');

  // 系统
  let system = 'unknow';
  if (testUa(/windows|win32|win64|wow32|wow64/g)) {
    system = 'windows'; // windows系统
  } else if (testUa(/macintosh|macintel/g)) {
    system = 'macos'; // macos系统
  } else if (testUa(/x11/g)) {
    system = 'linux'; // linux系统
  } else if (testUa(/android|adr/g)) {
    system = 'android'; // android系统
  } else if (testUa(/ios|iphone|ipad|ipod|iwatch/g)) {
    system = 'ios'; // ios系统
  } else if (testUa(/openharmony/g)) {
    system = 'openharmony'; // openharmony系统
  }

  let platform = 'desktop';
  if (system === 'windows' || system === 'macos' || system === 'linux') {
    platform = 'desktop';
  } else if (
    system === 'android' ||
    system === 'ios' ||
    system === 'openharmony' ||
    testUa(/mobile/g)
  ) {
    platform = 'mobile';
  }

  return platform as 'mobile' | 'desktop';
}

export async function fileExist(file: any) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    return false;
  }
}

export async function createFile(file: string, data: string = '') {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFileWithLock(file, data);
}

export async function handleLogPath(
  logPath: string,
  data: string = '',
): Promise<string> {
  const absolutePath = resolveFileAccess(config.logPath, [logPath]);
  if (!absolutePath) throw new Error('Log path is outside the log directory');
  const logFileExist = await fileExist(absolutePath);
  if (!logFileExist) {
    await createFile(absolutePath, data);
  }
  return absolutePath;
}

export async function concurrentRun(
  fnList: Array<() => Promise<any>> = [],
  max = 5,
) {
  if (!fnList.length) return;

  const replyList: any[] = []; // 收集任务执行结果
  const startTime = new Date().getTime(); // 记录任务执行开始时间

  // 任务执行程序
  const schedule = async (index: number) => {
    return new Promise(async (resolve) => {
      const fn = fnList[index];
      if (!fn) return resolve(null);

      // 执行当前异步任务
      const reply = await fn();
      replyList[index] = reply;

      // 执行完当前任务后，继续执行任务池的剩余任务
      await schedule(index + max);
      resolve(null);
    });
  };

  // 任务池执行程序
  const scheduleList = new Array(max)
    .fill(0)
    .map((_, index) => schedule(index));

  // 使用 Promise.all 批量执行
  const r = await Promise.all(scheduleList);
  const cost = (new Date().getTime() - startTime) / 1000;

  return replyList;
}

enum FileType {
  'directory',
  'file',
}

export interface IFile {
  title: string;
  key: string;
  type: 'directory' | 'file';
  parent: string;
  createTime: number;
  size?: number;
  children?: IFile[];
}

export function dirSort(a: IFile, b: IFile): number {
  if (a.type === 'file' && b.type === 'file') {
    return b.createTime - a.createTime;
  } else if (a.type === 'directory' && b.type === 'directory') {
    return a.title.localeCompare(b.title);
  } else {
    return a.type === 'directory' ? -1 : 1;
  }
}

const FILE_SYSTEM_READ_CONCURRENCY = 32;

type FileSystemTaskRunner = <T>(task: () => Promise<T>) => Promise<T>;

function createFileSystemTaskRunner(concurrency: number): FileSystemTaskRunner {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    while (activeCount < concurrency && queue.length > 0) {
      activeCount += 1;
      queue.shift()?.();
    }
  };

  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            activeCount -= 1;
            runNext();
          });
      });
      runNext();
    });
}

async function readDirsWithRunner(
  dir: string,
  baseDir: string,
  blacklist: string[],
  sort: (a: IFile, b: IFile) => number,
  runFileSystemTask: FileSystemTaskRunner,
): Promise<IFile[]> {
  const relativePath = path.relative(baseDir, dir);
  const entries = await runFileSystemTask(() =>
    fs.readdir(dir, { withFileTypes: true }),
  );

  const items = await Promise.all(
    entries.map(async (entry): Promise<IFile | undefined> => {
      if (blacklist.includes(entry.name) || entry.isSymbolicLink()) {
        return undefined;
      }

      const subPath = path.join(dir, entry.name);
      const stats = await runFileSystemTask(() => fs.lstat(subPath));
      if (stats.isSymbolicLink()) {
        return undefined;
      }
      const key = path.join(relativePath, entry.name);

      if (stats.isDirectory()) {
        const children = await readDirsWithRunner(
          subPath,
          baseDir,
          blacklist,
          sort,
          runFileSystemTask,
        );
        return {
          title: entry.name,
          key,
          type: 'directory',
          parent: relativePath,
          createTime: stats.birthtime.getTime(),
          children,
        };
      }

      return {
        title: entry.name,
        type: 'file',
        key,
        parent: relativePath,
        size: stats.size,
        createTime: stats.birthtime.getTime(),
      };
    }),
  );

  return items.filter((item): item is IFile => Boolean(item)).sort(sort);
}

export async function readDirs(
  dir: string,
  baseDir: string = '',
  blacklist: string[] = [],
  sort: (a: IFile, b: IFile) => number = dirSort,
): Promise<IFile[]> {
  return readDirsWithRunner(
    dir,
    baseDir,
    blacklist,
    sort,
    createFileSystemTaskRunner(FILE_SYSTEM_READ_CONCURRENCY),
  );
}

export async function readDir(
  dir: string,
  baseDir: string = '',
  blacklist: string[] = [],
): Promise<IFile[]> {
  const absoluteDir = path.resolve(baseDir, dir);
  if (!absoluteDir.startsWith(path.resolve(baseDir))) {
    return [];
  }
  const relativePath = path.relative(baseDir, absoluteDir);

  try {
    const files = await fs.readdir(absoluteDir);
    const result: IFile[] = [];

    for (const file of files) {
      const subPath = path.join(absoluteDir, file);
      const stats = await fs.lstat(subPath);
      const key = path.join(relativePath, file);

      if (blacklist.includes(file) || stats.isSymbolicLink()) {
        continue;
      }

      if (stats.isDirectory()) {
        result.push({
          title: file,
          type: 'directory',
          key,
          parent: relativePath,
          createTime: stats.birthtime.getTime(),
          children: [],
        });
      } else {
        result.push({
          title: file,
          type: 'file',
          key,
          parent: relativePath,
          size: stats.size,
          createTime: stats.birthtime.getTime(),
        });
      }
    }

    return result;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function promiseExec(command: string): Promise<string> {
  try {
    const { stderr, stdout } = await promisify(exec)(command, {
      maxBuffer: 200 * 1024 * 1024,
      encoding: 'utf8',
    });
    return stdout || stderr;
  } catch (error) {
    return JSON.stringify(error);
  }
}

export async function promiseExecSuccess(command: string): Promise<string> {
  try {
    const { stdout } = await promisify(exec)(command, {
      maxBuffer: 200 * 1024 * 1024,
      encoding: 'utf8',
    });
    return stdout || '';
  } catch (error) {
    return '';
  }
}

export function parseHeaders(headers: string) {
  if (!headers) return {};

  const parsed: any = {};
  let key: string;
  let val: string;
  let i: number;

  headers &&
    headers.split('\n').forEach(function parser(line) {
      i = line.indexOf(':');
      key = line.substring(0, i).trim().toLowerCase();
      val = line.substring(i + 1).trim();

      if (!key) {
        return;
      }

      parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
    });

  return parsed;
}

function parseString(
  input: string,
  valueFormatFn?: (v: string) => string,
): Record<string, string> {
  const regex = /(\w+):\s*((?:(?!\n\w+:).)*)/g;
  const matches: Record<string, string> = {};

  let match;
  while ((match = regex.exec(input)) !== null) {
    const [, key, value] = match;
    const _key = key.trim();
    if (!_key || matches[_key]) {
      continue;
    }

    let _value = value.trim();

    try {
      _value = valueFormatFn ? valueFormatFn(_value) : _value;
      const jsonValue = JSON.parse(_value);
      matches[_key] = jsonValue;
    } catch (error) {
      matches[_key] = _value;
    }
  }

  return matches;
}

export function parseBody(
  body: string,
  contentType:
    | 'application/json'
    | 'multipart/form-data'
    | 'application/x-www-form-urlencoded'
    | 'text/plain',
  valueFormatFn?: (v: string) => string,
) {
  if (contentType === 'text/plain' || !body) {
    return valueFormatFn && body ? valueFormatFn(body) : body;
  }

  const parsed = parseString(body, valueFormatFn);

  switch (contentType) {
    case 'multipart/form-data':
      return Object.keys(parsed).reduce((p, c) => {
        p.append(c, parsed[c]);
        return p;
      }, new FormData());
    case 'application/x-www-form-urlencoded':
      return Object.keys(parsed).reduce((p, c) => {
        return p ? `${p}&${c}=${parsed[c]}` : `${c}=${parsed[c]}`;
      });
  }

  return parsed;
}

export function psTree(pid: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    psTreeFun(pid, (err: any, children) => {
      if (err) {
        reject(err);
      }
      resolve(children.map((x) => Number(x.PID)).filter((x) => !isNaN(x)));
    });
  });
}

export async function killTask(pid: number, waitForExit = false) {
  const descendants = await psTree(pid);
  if (!waitForExit) {
    if (descendants.length) {
      try {
        [pid, ...descendants]
          .reverse()
          .forEach((target) => process.kill(target, 15));
      } catch {}
    } else process.kill(pid, 2);
    return;
  }
  const pids = [...descendants.reverse(), pid];
  const signal = (target: number, sig: NodeJS.Signals) => {
    try {
      process.kill(target, sig);
    } catch (error: any) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  for (const target of pids) signal(target, 'SIGTERM');
  const alive = async (target: number) => {
    try {
      process.kill(target, 0);
    } catch (error: any) {
      if (error.code === 'ESRCH') return false;
      throw error;
    }
    if (process.platform === 'linux') {
      try {
        const stat = await fs.readFile(`/proc/${target}/stat`, 'utf8');
        // The command field may contain spaces and parentheses. Zombies have
        // exited even while their parent has not reaped the PID yet.
        const state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
        if (['Z', 'X', 'x'].includes(state)) return false;
      } catch {
        // /proc may be unavailable, or the process may have just exited.
        // Retain the portable signal probe rather than assuming it is dead.
        try {
          process.kill(target, 0);
        } catch (error: any) {
          if (error.code === 'ESRCH') return false;
          throw error;
        }
      }
    }
    return true;
  };
  const wait = async () => {
    const deadline = Date.now() + 1000;
    let remaining = pids;
    while (true) {
      const states = await Promise.all(remaining.map(alive));
      remaining = remaining.filter((_, index) => states[index]);
      if (!remaining.length || Date.now() >= deadline) return remaining;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  let remaining = await wait();
  if (!remaining.length) return;
  for (const target of remaining) signal(target, 'SIGKILL');
  remaining = await wait();
  if (remaining.length)
    throw new Error(`Task processes did not exit: ${remaining.join(', ')}`);
}

export async function getPid(cmd: string) {
  const taskCommand = `ps -eo pid,command | grep "${cmd}" | grep -v grep | awk '{print $1}' | head -1 | xargs echo -n`;
  const pid = await promiseExec(taskCommand);
  return pid ? Number(pid) : undefined;
}

export async function getAllPids(cmd: string): Promise<number[]> {
  const taskCommand = `ps -eo pid,command | grep "${cmd}" | grep -v grep | awk '{print $1}'`;
  const pidsStr = await promiseExec(taskCommand);
  if (!pidsStr) return [];
  return pidsStr
    .split('\n')
    .map((p) => Number(p.trim()))
    .filter((p) => !isNaN(p) && p > 0);
}

export async function killAllTasks(cmd: string): Promise<void> {
  const pids = await getAllPids(cmd);
  for (const pid of pids) {
    try {
      await killTask(pid);
    } catch (error) {
      // Ignore errors if process already terminated
    }
  }
}

interface IVersion {
  version: string;
  changeLogLink: string;
  changeLog: string;
  publishTime: string;
}

export async function parseVersion(path: string): Promise<IVersion> {
  return load(await fs.readFile(path, 'utf8')) as IVersion;
}

export function parseContentVersion(content: string): IVersion {
  return load(content) as IVersion;
}

export function safeJSONParse(value?: string) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    Logger.error('[safeJSONParse error]', error);
    return {};
  }
}

export function errStack(error: unknown): string {
  return error instanceof Error && error.stack
    ? error.stack
    : String(error);
}

export async function rmPath(path: string) {
  try {
    const _exsit = await fileExist(path);
    if (_exsit) {
      await fs.rm(path, { force: true, recursive: true, maxRetries: 5 });
    }
  } catch (error) {
    Logger.error('[rmPath error]', error);
  }
}

export async function setSystemTimezone(timezone: string): Promise<boolean> {
  try {
    if (!(await fileExist(`/usr/share/zoneinfo/${timezone}`))) {
      throw new Error('Invalid timezone');
    }

    await promiseExec(maybeSudo(`ln -sf /usr/share/zoneinfo/${timezone} /etc/localtime`));
    await promiseExec(`echo "${timezone}" | ${maybeSudo('tee /etc/timezone')}`);

    return true;
  } catch (error) {
    Logger.error('[setSystemTimezone error]', error);
    return false;
  }
}

export function isDemoEnv() {
  return process.env.DeployEnv === 'demo';
}

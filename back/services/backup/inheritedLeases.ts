import { AsyncLocalStorage } from 'async_hooks';
const context = new AsyncLocalStorage<{ fd: number; active: boolean }[]>();
let backendFd: number | undefined;
/** Retained by the primary and inherited at FD 4 by its cluster workers. */
export function setBackendLeaseFd(fd: number) {
  backendFd = fd;
}
export function inheritedLeaseFds() {
  return [
    ...new Set([
      ...(backendFd === undefined ? [] : [backendFd]),
      ...(context.getStore() || [])
        .filter((scope) => scope.active)
        .map((scope) => scope.fd),
    ]),
  ];
}
export async function withInheritedLease<T>(
  fd: number,
  action: () => Promise<T>,
) {
  const scope = { fd, active: true };
  try {
    return await context.run([...(context.getStore() || []), scope], action);
  } finally {
    scope.active = false;
  }
}

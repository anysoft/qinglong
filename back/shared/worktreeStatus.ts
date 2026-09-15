export interface WorktreeGitStatus {
  head: string | null;
  branch: string | null;
  remoteBranch: string | null;
  clean: boolean;
  detached: boolean;
  staged: number;
  modified: number;
  untracked: number;
  conflicted: number;
  ignored: number;
  ahead: number | null;
  behind: number | null;
  remote_missing: boolean;
  changed_files: { path: string; index: string; worktree: string }[];
}
export function parsePorcelain(text: string) {
  const result = {
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
    ignored: 0,
    changed_files: [] as WorktreeGitStatus['changed_files'],
  };
  const tokens = text.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const index = token[0],
      worktree = token[1],
      file = token.slice(3);
    result.changed_files.push({ path: file, index, worktree });
    if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(index + worktree))
      result.conflicted++;
    else if (index === '?' && worktree === '?') result.untracked++;
    else if (index === '!' && worktree === '!') result.ignored++;
    else {
      if (index !== ' ') result.staged++;
      if (worktree !== ' ') result.modified++;
    }
    if (index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C')
      i++;
  }
  return result;
}

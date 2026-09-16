import { Router } from 'express';
/** Retired staging editor. Existing files and backups are intentionally preserved. */
export default function retiredScriptRoutes(app: Router) {
  const route = Router();
  const retired = (_req: unknown, res: any) =>
    res
      .status(410)
      .send({
        code: 410,
        error_code: 'CODE_WORKSPACE_REQUIRED',
        message: 'Use registered Worktree Code Workspace',
      });
  route.get('/detail', retired);
  route.use(retired);
  app.use('/scripts', route);
}

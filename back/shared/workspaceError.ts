import { GitResourceError } from './gitSecurity';
export class WorkspaceError extends GitResourceError {
  constructor(public error_code: string, message = error_code, status = 409) {
    super(message, status);
    this.name = 'WorkspaceError';
  }
}

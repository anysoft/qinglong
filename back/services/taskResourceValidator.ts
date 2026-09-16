import TaskResourceResolver from './taskResourceResolver';
/** Explicit deep validation. It never acquires a run lease or starts a process. */
export default class TaskResourceValidator {
  async validate(id: number) {
    return new TaskResourceResolver().detail(id, true);
  }
}

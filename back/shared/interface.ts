
export type Override<
  T,
  K extends Partial<{ [P in keyof T]: any }> | string,
> = K extends string
  ? Omit<T, K> & { [P in keyof T]: T[P] | unknown }
  : Omit<T, keyof K> & K;



export interface ISchedule {
  schedule?: string;
  name?: string;
  command?: string;
  id: string;
}

export interface IScheduleFn<T> {
  (): Promise<T>;
  schedule?: ISchedule;
}

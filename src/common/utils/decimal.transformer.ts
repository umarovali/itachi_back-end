import { ValueTransformer } from 'typeorm';

/** PostgreSQL numeric приходит строкой — превращаем в number */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? null : Number(value)),
};

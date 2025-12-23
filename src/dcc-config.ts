import { z } from 'zod'

export const DccConfig = z.object({
  token: z.string(),
  prLabels: z
    .string()
    .array()
    .optional(),
  openOn: z.enum(['github', 'graphite']).optional(),
})

export type DccConfig = z.infer<typeof DccConfig> // eslint-disable-line no-redeclare

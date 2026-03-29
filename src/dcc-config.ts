import { z } from 'zod'

export const DccConfig = z.object({
  token: z.string(),
  prLabels: z
    .string()
    .array()
    .optional(),
  openOn: z.enum(['github', 'graphite']).optional(),
})

// eslint-disable-next-line no-redeclare
export type DccConfig = z.infer<typeof DccConfig>

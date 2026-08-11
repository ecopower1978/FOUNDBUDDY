import type { Payload } from 'payload'

import { env, isSMTPConfigured } from '@/config/env'

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 1_000)
  }
  return 'Unknown error'
}

export async function sendSystemAlert(
  payload: Payload,
  subject: string,
  error: unknown,
) {
  if (!isSMTPConfigured) return

  try {
    await payload.sendEmail({
      subject: `[Website alert] ${subject}`.slice(0, 180),
      text: [
        `Time: ${new Date().toISOString()}`,
        `Environment: ${process.env.NODE_ENV || 'unknown'}`,
        `Error: ${errorSummary(error)}`,
      ].join('\n'),
      to: env.smtp.fromAddress,
    })
  } catch (mailError) {
    payload.logger.error({
      err: mailError,
      message: 'Unable to send system alert email',
    })
  }
}

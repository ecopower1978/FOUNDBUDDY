import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import {
  resolveCustomerServiceConfig,
  type CustomerServiceSettings,
  type ResolvedCustomerServiceConfig,
} from '@/customerService/config'

export async function getCustomerServiceConfig(
  payload?: Payload,
): Promise<ResolvedCustomerServiceConfig> {
  let payloadClient = payload

  try {
    payloadClient ??= await getPayload({ config: configPromise })
    const settings = await payloadClient.findGlobal({
      depth: 0,
      overrideAccess: true,
      slug: 'customer-service',
    })

    return resolveCustomerServiceConfig(settings as CustomerServiceSettings)
  } catch (error) {
    payloadClient?.logger.warn({
      err: error,
      message: 'Unable to read customer service settings; using environment fallback.',
    })
    return resolveCustomerServiceConfig()
  }
}

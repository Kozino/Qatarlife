import { config } from './config'
import { LifeRuleError } from './life-store'

export type SokoniSyncPayload = {
  businessId: string
  title: string
  description: string
  externalReference?: string
}

export interface ExternalCommerceAdapter {
  readonly configured: boolean
  syncBusinessListing(payload: SokoniSyncPayload): Promise<{ externalId: string; status: string }>
}

class SokoniHubAdapter implements ExternalCommerceAdapter {
  readonly configured = Boolean(config.sokoniHubBaseUrl && config.sokoniHubApiKey)

  async syncBusinessListing(payload: SokoniSyncPayload) {
    if (!this.configured || !config.sokoniHubBaseUrl || !config.sokoniHubApiKey) {
      throw new LifeRuleError('INTEGRATION_NOT_CONFIGURED', 'The optional Sokoni Hub integration is not configured.', 409)
    }
    const response = await fetch(`${config.sokoniHubBaseUrl.replace(/\/$/, '')}/v1/listings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.sokoniHubApiKey}` },
      body: JSON.stringify({ ...payload, fictionalEconomy: false, source: 'qatar-life' }),
    })
    if (!response.ok) throw new LifeRuleError('INTEGRATION_FAILED', 'The external commerce adapter could not complete the request.', 502)
    const result = await response.json() as { id?: string; status?: string }
    if (!result.id) throw new LifeRuleError('INTEGRATION_INVALID_RESPONSE', 'The external commerce adapter returned an invalid response.', 502)
    return { externalId: result.id, status: result.status ?? 'submitted' }
  }
}

export const sokoniHub: ExternalCommerceAdapter = new SokoniHubAdapter()

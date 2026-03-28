import type { OpenClawRequest, OpenClawResponse } from '../types.js'

/**
 * OpenClaw client interface.
 * MVP ships MockOpenClawClient.
 * Replace with HttpOpenClawClient when the real API is available.
 */
export interface IOpenClawClient {
  processMessage(req: OpenClawRequest): Promise<OpenClawResponse>
}

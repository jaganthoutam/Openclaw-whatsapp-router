import type { IOpenClawClient } from './IOpenClawClient.js'
import type { OpenClawRequest, OpenClawResponse } from '../types.js'
import { logger } from '../logger.js'

/**
 * Mock OpenClaw client used until the real API is integrated.
 * Simulates processing latency and returns a canned echo response.
 */
export class MockOpenClawClient implements IOpenClawClient {
  async processMessage(req: OpenClawRequest): Promise<OpenClawResponse> {
    logger.info(
      { tenantId: req.tenantId, messageId: req.messageId, sender: req.senderNumber },
      '[MockOpenClaw] Processing message',
    )

    // Simulate async processing delay
    await new Promise((resolve) => setTimeout(resolve, 80))

    return {
      replyText: `[OpenClaw] Hello from tenant ${req.tenantId}! You said: "${req.body}"`,
      metadata: {
        mock: true,
        processedAt: new Date().toISOString(),
        tenantId: req.tenantId,
        messageId: req.messageId,
      },
    }
  }
}

import type { Request, Response, NextFunction } from 'express'
import { config } from '../../config.js'

/**
 * Validates the X-Admin-Secret header for all /admin/* routes.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-admin-secret']
  if (!secret || secret !== config.adminSecret) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid X-Admin-Secret header' })
    return
  }
  next()
}

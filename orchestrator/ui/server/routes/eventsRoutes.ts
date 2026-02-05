import { Router, Request, Response } from 'express';
import { RouteContext, ServerEvent } from '../UIServerService.js';
import { logger } from '../../../../core/utils/logger.js';

/**
 * Create Server-Sent Events routes for real-time updates
 */
export function createEventsRoutes(context: RouteContext): Router {
  const router = Router();

  /**
   * GET /api/events
   * Server-Sent Events endpoint for real-time updates
   */
  router.get('/', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection event
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ message: 'Connected to event stream' })}\n\n`);

    // Flush headers immediately
    res.flushHeaders();

    logger.debug('SSE client connected');

    // Event listener for server events
    const eventHandler = (event: ServerEvent) => {
      // Include event type in data so it works with onmessage handler
      // (Named SSE events require addEventListener which is more complex)
      const dataWithMeta =
        typeof event.data === 'object' && event.data !== null
          ? {
              type: event.type,
              ...(event.data as Record<string, unknown>),
              timestamp: event.timestamp.toISOString()
            }
          : { type: event.type, data: event.data, timestamp: event.timestamp.toISOString() };
      const eventData = JSON.stringify(dataWithMeta);

      res.write(`data: ${eventData}\n\n`);
    };

    // Subscribe to events
    context.eventEmitter.on('server-event', eventHandler);

    // Keep connection alive with periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 30000); // Every 30 seconds

    // Handle client disconnect
    req.on('close', () => {
      logger.debug('SSE client disconnected');
      context.eventEmitter.off('server-event', eventHandler);
      clearInterval(heartbeatInterval);
    });

    // Handle errors
    req.on('error', (err) => {
      // "aborted" is normal - happens when client disconnects (tab close, refresh, etc.)
      if (err.message === 'aborted') {
        logger.debug('SSE client connection aborted');
      } else {
        logger.error(`SSE error: ${err.message}`);
      }
      context.eventEmitter.off('server-event', eventHandler);
      clearInterval(heartbeatInterval);
    });
  });

  /**
   * POST /api/events/test
   * Test endpoint to emit a sample event (for debugging)
   */
  router.post('/test', (req: Request, res: Response) => {
    const { type, data } = req.body as { type?: string; data?: unknown };

    context.eventEmitter.emit('server-event', {
      type: type || 'test',
      data: data || { message: 'Test event' },
      timestamp: new Date(),
    });

    return res.json({
      success: true,
      message: 'Test event emitted',
    });
  });

  /**
   * GET /api/events/clients
   * Get the number of connected SSE clients
   */
  router.get('/clients', (_req: Request, res: Response) => {
    const listenerCount = context.eventEmitter.listenerCount('server-event');
    return res.json({
      connectedClients: listenerCount,
    });
  });

  return router;
}

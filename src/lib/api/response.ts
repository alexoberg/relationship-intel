/**
 * Standardized API Response Utilities
 *
 * Provides consistent response formatting across all API routes.
 *
 * Success responses:
 * { success: true, data: T }
 *
 * Error responses:
 * { success: false, error: string, code?: string }
 */

import { NextResponse } from 'next/server';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Create a success response
 */
export function success<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Create an error response
 */
export function error(
  message: string,
  status = 500,
  code?: string
): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

/**
 * Common error responses
 */
export const errors = {
  unauthorized: () => error('Unauthorized', 401, 'UNAUTHORIZED'),
  forbidden: () => error('Forbidden', 403, 'FORBIDDEN'),
  notFound: (resource = 'Resource') => error(`${resource} not found`, 404, 'NOT_FOUND'),
  badRequest: (message: string) => error(message, 400, 'BAD_REQUEST'),
  internal: (message = 'Internal server error') => error(message, 500, 'INTERNAL_ERROR'),
  googleNotConnected: () => error('Google not connected', 400, 'GOOGLE_NOT_CONNECTED'),
  validationError: (message: string) => error(message, 422, 'VALIDATION_ERROR'),
};

/**
 * Wrap an async handler with standardized error handling
 */
export function withErrorHandling(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return handler().catch((err) => {
    console.error('API Error:', err);
    return errors.internal(err instanceof Error ? err.message : 'Unknown error');
  });
}

import { randomUUID } from 'node:crypto';
import type { LoggerService } from '@nestjs/common';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import type { Redactor } from './redact';

/** Codes of errors that describe the request, not the server, so they reach the client as they are. */
const CLIENT_ERROR_CODES = new Set([
  'GRAPHQL_PARSE_FAILED',
  'GRAPHQL_VALIDATION_FAILED',
  'BAD_USER_INPUT',
  'BAD_REQUEST',
  'OPERATION_RESOLUTION_FAILURE',
  'PERSISTED_QUERY_NOT_FOUND',
  'PERSISTED_QUERY_NOT_SUPPORTED',
]);

export type FormatError = (
  formattedError: GraphQLFormattedError,
  error: unknown,
) => GraphQLFormattedError;

/** The error a resolver threw, as Apollo's `unwrapResolverError` finds it. */
const unwrap = (error: unknown) =>
  error instanceof GraphQLError && error.path && error.originalError
    ? error.originalError
    : error;

/** Thrown on purpose: a GraphQLError or a Nest HTTP exception, e.g. from `authorize`. */
const isDeliberate = (error: unknown) =>
  error instanceof GraphQLError ||
  typeof (error as { getStatus?: unknown } | null)?.getStatus === 'function';

/**
 * Apollo `formatError` that replaces errors from the database or any other
 * unexpected failure with a generic one carrying an `errorId`, and logs the
 * original under that id. Errors about the request itself, and errors thrown
 * on purpose, go through as they are.
 */
export function maskErrors(
  logger: LoggerService,
  redact: Redactor,
): FormatError {
  return (formatted, error) => {
    const code = formatted.extensions?.code;
    const original = unwrap(error);
    if (
      (typeof code === 'string' && CLIENT_ERROR_CODES.has(code)) ||
      isDeliberate(original)
    ) {
      return formatted;
    }

    const errorId = randomUUID();
    const message =
      original instanceof Error ? original.message : String(original);
    const stack = original instanceof Error ? original.stack : undefined;
    const path = formatted.path ? ` at ${formatted.path.join('.')}` : '';
    logger.error(
      redact(`Request failed${path} (errorId ${errorId}): ${message}`),
      stack && redact(stack),
    );
    return {
      message: 'Internal server error',
      locations: formatted.locations,
      path: formatted.path,
      extensions: { code: 'INTERNAL_SERVER_ERROR', errorId },
    };
  };
}

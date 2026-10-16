import type { ApolloDriverConfig } from '@nestjs/apollo';
import type { LoggerService } from '@nestjs/common';
import type { DatabaseConnection } from '../adapters/database-adapter.interface';
import type { PaginationSettings } from '../graphql/resolvers';
import type { InverseModelOptions } from '../inverse-model.interfaces';
import { secureResolvers, withScope } from './access-hooks';
import { maskErrors } from './mask-errors';
import { queryLimitRules } from './query-limits';
import { createRedactor, type Redactor, redactError } from './redact';
import { restrictConnection } from './restrict-models';

/** Hides the passwords of the database and cache URLs of the options. */
export const redactorFor = (options: InverseModelOptions): Redactor =>
  createRedactor([options.url, options.cache?.url]);

/**
 * Opens the connection and narrows it to the tables and fields the options
 * allow, before anything else sees it. A failure to connect is rethrown
 * with the connection string's password hidden.
 */
export async function openRestricted(
  options: InverseModelOptions,
  open: () => Promise<DatabaseConnection>,
): Promise<DatabaseConnection> {
  let connection: DatabaseConnection;
  try {
    connection = await open();
  } catch (error) {
    throw redactError(error, redactorFor(options));
  }
  return restrictConnection(connection, options);
}

/**
 * Apollo options of the API with the security options applied: `scope` on
 * the connection, `authorize` and read-only models on the resolvers, query
 * limits as validation rules, and masked errors.
 */
export function secureGraphQL(
  connection: DatabaseConnection,
  options: InverseModelOptions,
  pagination: PaginationSettings,
  logger: LoggerService,
  build: (connection: DatabaseConnection) => ApolloDriverConfig,
): ApolloDriverConfig {
  const scoped = withScope(connection, options.scope);
  const config = build(scoped);
  const mask = maskErrors(logger, redactorFor(options));
  const formatError = config.formatError;
  return {
    ...config,
    resolvers: secureResolvers(
      config.resolvers as Record<string, unknown>,
      scoped.models,
      options.authorize,
    ) as ApolloDriverConfig['resolvers'],
    validationRules: [
      ...(config.validationRules ?? []),
      // Through unknown: ts-jest may read graphql's ESM types for Apollo and its CommonJS ones here.
      ...(queryLimitRules({
        maxDepth: options.queryLimits?.maxDepth ?? 10,
        maxComplexity: options.queryLimits?.maxComplexity ?? 50000,
        ...pagination,
      }) as unknown as NonNullable<ApolloDriverConfig['validationRules']>),
    ],
    formatError: formatError
      ? (formatted, error) => formatError(mask(formatted, error), error)
      : mask,
  };
}

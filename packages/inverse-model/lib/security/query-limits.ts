import {
  type FieldNode,
  GraphQLError,
  type GraphQLNamedType,
  type GraphQLOutputType,
  getNamedType,
  getNullableType,
  isListType,
  isObjectType,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

export interface QueryLimitSettings {
  maxDepth: number;
  maxComplexity: number;
  /** Rows a list is assumed to return without a `limit`. */
  defaultLimit: number;
  /** Rows a list returns at most, also assumed for a `limit` given as a variable. */
  maxLimit: number;
}

// Introspection queries nest deeply but read no data.
const isIntrospection = (node: FieldNode) => node.name.value.startsWith('__');

/** Fields of a selection set, looking through fragments, with the type each is selected on. */
function* fieldsOf(
  context: ValidationContext,
  selectionSet: SelectionSetNode,
  type: GraphQLNamedType | undefined,
  visited: Set<string>,
): Generator<{ node: FieldNode; parent: GraphQLNamedType | undefined }> {
  const schema = context.getSchema();
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      yield { node: selection, parent: type };
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const condition = selection.typeCondition
        ? schema.getType(selection.typeCondition.name.value)
        : type;
      yield* fieldsOf(context, selection.selectionSet, condition, visited);
    } else {
      const name = selection.name.value;
      const fragment = context.getFragment(name);
      if (!fragment || visited.has(name)) continue;
      yield* fieldsOf(
        context,
        fragment.selectionSet,
        schema.getType(fragment.typeCondition.name.value),
        new Set([...visited, name]),
      );
    }
  }
}

function fieldType(
  parent: GraphQLNamedType | undefined,
  node: FieldNode,
): GraphQLOutputType | undefined {
  return isObjectType(parent)
    ? parent.getFields()[node.name.value]?.type
    : undefined;
}

/** A Relay connection of the generated API: an object type with `edges` and `pageInfo`. */
const isConnection = (type: GraphQLOutputType) => {
  const named = getNamedType(type);
  return (
    isObjectType(named) &&
    named.name.endsWith('Connection') &&
    'edges' in named.getFields() &&
    'pageInfo' in named.getFields()
  );
};

const getNamedTypeOf = (
  parent: GraphQLNamedType | undefined,
  node: FieldNode,
) => {
  const type = fieldType(parent, node);
  return type && getNamedType(type);
};

/**
 * Validation rules that turn away queries nested deeper than `maxDepth` or
 * costing more than `maxComplexity` before any of them runs.
 */
export function queryLimitRules(
  settings: QueryLimitSettings,
): ValidationRule[] {
  const depthRule: ValidationRule = (context) => ({
    OperationDefinition(operation) {
      const depth = (
        selectionSet: SelectionSetNode,
        type: GraphQLNamedType | undefined,
      ): number => {
        let deepest = 0;
        for (const { node, parent } of fieldsOf(
          context,
          selectionSet,
          type,
          new Set(),
        )) {
          if (isIntrospection(node)) continue;
          const below = node.selectionSet
            ? depth(node.selectionSet, getNamedTypeOf(parent, node))
            : 0;
          deepest = Math.max(deepest, 1 + below);
        }
        return deepest;
      };
      const found = depth(
        operation.selectionSet,
        context.getSchema().getRootType(operation.operation) ?? undefined,
      );
      if (found > settings.maxDepth) {
        context.reportError(
          new GraphQLError(
            `Query is nested ${found} levels deep; at most ${settings.maxDepth} are allowed.`,
            { nodes: [operation] },
          ),
        );
      }
      return false;
    },
  });

  /** Rows a list field may return, from its `limit` argument, or `first` or `last` for a connection. */
  const rowsOf = (node: FieldNode) => {
    const limit = node.arguments?.find((argument) =>
      ['limit', 'first', 'last'].includes(argument.name.value),
    );
    if (!limit) return settings.defaultLimit;
    if (limit.value.kind === Kind.INT) {
      return Math.max(
        0,
        Math.min(Number(limit.value.value), settings.maxLimit),
      );
    }
    return limit.value.kind === Kind.NULL
      ? settings.defaultLimit
      : settings.maxLimit;
  };

  const complexityRule: ValidationRule = (context) => ({
    OperationDefinition(operation) {
      const cost = (
        selectionSet: SelectionSetNode,
        type: GraphQLNamedType | undefined,
      ): number => {
        let total = 0;
        for (const { node, parent } of fieldsOf(
          context,
          selectionSet,
          type,
          new Set(),
        )) {
          if (isIntrospection(node)) continue;
          const returned = fieldType(parent, node);
          // A connection pages its edges, so its page size counts there and not again on them.
          const inConnection = isObjectType(parent) && isConnection(parent);
          const paged =
            returned !== undefined &&
            !inConnection &&
            (isConnection(returned) ||
              (isListType(getNullableType(returned)) &&
                isObjectType(getNamedType(returned))));
          const rows = paged ? rowsOf(node) : 1;
          const below = node.selectionSet
            ? cost(node.selectionSet, getNamedTypeOf(parent, node))
            : 0;
          total += 1 + rows * below;
        }
        return total;
      };
      const found = cost(
        operation.selectionSet,
        context.getSchema().getRootType(operation.operation) ?? undefined,
      );
      if (found > settings.maxComplexity) {
        context.reportError(
          new GraphQLError(
            `Query costs ${found}; at most ${settings.maxComplexity} is allowed.`,
            { nodes: [operation] },
          ),
        );
      }
      return false;
    },
  });

  return [depthRule, complexityRule];
}

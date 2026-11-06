// SPDX-License-Identifier: Apache-2.0
import { Kind, parse, valueFromASTUntyped, type FragmentDefinitionNode, type SelectionSetNode } from "graphql";
import { object } from "./schema";

export const QUERY_LIMITS = { bytes: 8192, depth: 8, fields: 100, roots: 6, rows: 100 } as const;
export const INTROSPECTION_QUERY =
  "{ __schema { queryType { name } types { kind name fields { name args { name defaultValue type { kind name ofType { kind name ofType { kind name } } } } type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }";
export type QueryMetrics = { bytes: number; depth: number; fields: number; roots: number };

/** Parse read-only GraphQL and count expanded fragments. @example inspectQuery("{ stats { tps } }") */
export function inspectQuery(query: string, variables: Record<string, unknown> = {}): QueryMetrics {
  const bytes = new TextEncoder().encode(query).length;
  if (bytes > QUERY_LIMITS.bytes) throw new Error(`Query exceeds ${QUERY_LIMITS.bytes} bytes`);
  if (JSON.stringify(variables).length > QUERY_LIMITS.bytes) throw new Error("Variables exceed size limit");
  const document = parse(query, { maxTokens: 2000 });
  const operations = document.definitions.filter((definition) => definition.kind === Kind.OPERATION_DEFINITION);
  if (operations.length !== 1 || operations[0]?.operation !== "query")
    throw new Error("Exactly one read-only query is allowed");
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      if (fragments.has(definition.name.value)) throw new Error("Duplicate fragment");
      fragments.set(definition.name.value, definition);
    } else if (definition.kind !== Kind.OPERATION_DEFINITION) throw new Error("Only executable queries are allowed");
  }
  const resolved = { ...variables };
  for (const variable of operations[0].variableDefinitions ?? []) {
    if (!(variable.variable.name.value in resolved) && variable.defaultValue)
      resolved[variable.variable.name.value] = valueFromASTUntyped(variable.defaultValue) as unknown;
  }
  const metrics = { bytes, depth: 0, fields: 0, roots: 0 };
  const used = new Set<string>();
  const walk = (set: SelectionSetNode, depth: number, stack: Set<string>) => {
    for (const selection of set.selections) {
      if (selection.kind === Kind.FIELD) {
        metrics.fields++;
        if (depth === 1) metrics.roots++;
        metrics.depth = Math.max(metrics.depth, depth);
        if (depth > QUERY_LIMITS.depth || metrics.fields > QUERY_LIMITS.fields || metrics.roots > QUERY_LIMITS.roots)
          throw new Error("Query exceeds depth, field or root limit");
        for (const argument of selection.arguments ?? []) {
          if (["limit", "first", "last", "offset"].includes(argument.name.value)) {
            const value: unknown = valueFromASTUntyped(argument.value, resolved);
            const offset = argument.name.value === "offset";
            if (
              typeof value !== "number" ||
              !Number.isSafeInteger(value) ||
              value < (offset ? 0 : 1) ||
              value > (offset ? 10_000 : QUERY_LIMITS.rows)
            )
              throw new Error(`Invalid bounded pagination argument: ${argument.name.value}`);
          }
        }
        if (selection.selectionSet) walk(selection.selectionSet, depth + 1, stack);
      } else if (selection.kind === Kind.INLINE_FRAGMENT) walk(selection.selectionSet, depth, stack);
      else {
        const name = selection.name.value;
        const fragment = fragments.get(name);
        if (!fragment || stack.has(name)) throw new Error("Unknown or cyclic fragment");
        used.add(name);
        walk(fragment.selectionSet, depth, new Set([...stack, name]));
      }
    }
  };
  walk(operations[0].selectionSet, 1, new Set());
  if (used.size !== fragments.size) throw new Error("Unused fragment");
  return metrics;
}

export type Completion = { type: string; field: string; args: string[]; returns: string };

/** Read field completions from a dated introspection response. @example completions({__schema: {types: []}}) */
export function completions(value: unknown): Completion[] {
  const schema = object(object(value).__schema);
  if (!Array.isArray(schema.types)) throw new Error("Introspection has no types");
  const entries: Completion[] = [];
  const typeName = (value: unknown, depth = 0): string => {
    const type = object(value);
    if (typeof type.name === "string") return type.name;
    return type.ofType && depth < 8 ? typeName(type.ofType, depth + 1) : "unknown";
  };
  for (const item of schema.types) {
    const type = object(item);
    if (typeof type.name !== "string") throw new Error("Invalid introspection type");
    if (!Array.isArray(type.fields) || type.name.startsWith("__")) continue;
    for (const item of type.fields) {
      const field = object(item);
      if (typeof field.name !== "string" || !Array.isArray(field.args)) throw new Error("Invalid introspection field");
      entries.push({
        type: type.name,
        field: field.name,
        returns: typeName(field.type),
        args: field.args.map((arg: unknown) => {
          const row = object(arg);
          if (typeof row.name !== "string") throw new Error("Invalid introspection argument");
          return `${row.name}: ${typeName(row.type)}`;
        }),
      });
    }
  }
  return entries;
}

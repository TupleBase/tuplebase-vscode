// Generates schemas/rowboat.schema.json from the adapter descriptors, so a new
// database's config validation comes from its field list rather than a
// hand-edited schema. Run `npm run gen:schema` after changing any adapter fields.
import type { AdapterPresentation, Field } from './types'
import { presentations } from './registry'

type JsonSchema = Record<string, unknown>

function propertyFor(f: Field): JsonSchema {
  const prop: JsonSchema = {}
  if (f.kind === 'number') prop.type = 'number'
  else if (f.kind === 'checkbox') prop.type = 'boolean'
  else if (f.kind === 'select') prop.enum = (f.options ?? []).filter(o => o !== '')
  else prop.type = 'string'
  // number/checkbox defaults are meaningful in config; text/select defaults are
  // form conveniences and stay out of the schema (matches the original by hand)
  if ((f.kind === 'number' || f.kind === 'checkbox') && f.default !== undefined) prop.default = f.default
  if (f.description) prop.description = f.description
  return prop
}

function branchFor(p: AdapterPresentation): JsonSchema {
  const properties: JsonSchema = {
    adapter: true,
    readonly: {
      type: 'boolean',
      description: 'Block write statements on this connection (overrides the group default)',
    },
  }
  for (const f of p.fields) properties[f.key] = propertyFor(f)
  return {
    if: { properties: { adapter: { const: p.id } } },
    then: {
      properties,
      required: p.fields.filter(f => f.required).map(f => f.key),
      additionalProperties: false,
    },
  }
}

export function buildJsonSchema(adapters: AdapterPresentation[] = presentations()): JsonSchema {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Rowboat configuration',
    type: 'object',
    required: ['version', 'groups'],
    properties: {
      version: { const: 1, description: 'Config schema version (must be 1)' },
      groups: {
        type: 'object',
        description: 'Named groups, each a folder of named connections',
        additionalProperties: {
          type: 'object',
          properties: {
            readonly: { type: 'boolean', description: 'Default: block write statements on connections in this group' },
          },
          patternProperties: { '^(?!readonly$).*': { $ref: '#/definitions/connection' } },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
    definitions: {
      connection: {
        type: 'object',
        required: ['adapter'],
        properties: { adapter: { enum: adapters.map(a => a.id) } },
        allOf: adapters.map(branchFor),
      },
    },
  }
}

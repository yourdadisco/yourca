/**
 * Schema validation system — ported from Claude Code's schemas.
 * Provides:
 * - Tool input validation
 * - Configuration schema validation
 * - Simple JSON Schema validation
 * - Hook schema types
 */

// ─── JSON Schema Validation ───

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validate a value against a JSON Schema.
 * Implements the most common JSON Schema validation keywords.
 */
export function validateAgainstSchema(value: unknown, schema: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') return errors;

  const schemaType = schema.type as string | undefined;

  if (schemaType === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown> | undefined;
    const required = schema.required as string[] | undefined;

    // Check required fields
    if (required) {
      for (const field of required) {
        if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
          errors.push({
            path: field,
            message: `Required field "${field}" is missing`,
          });
        }
      }
    }

    // Validate each property against its schema
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          const propErrors = validateAgainstSchema(obj[key], propSchema as Record<string, unknown>);
          for (const e of propErrors) {
            errors.push({ path: `${key}.${e.path}`, message: e.message });
          }
        }
      }
    }
  } else if (schemaType === 'string' && typeof value === 'string') {
    const minLen = schema.minLength as number | undefined;
    const maxLen = schema.maxLength as number | undefined;
    const pattern = schema.pattern as string | undefined;

    if (minLen !== undefined && value.length < minLen) {
      errors.push({ path: '', message: `String is too short (minimum ${minLen} characters)` });
    }
    if (maxLen !== undefined && value.length > maxLen) {
      errors.push({ path: '', message: `String is too long (maximum ${maxLen} characters)` });
    }
    if (pattern && !new RegExp(pattern).test(value)) {
      errors.push({ path: '', message: `String does not match pattern ${pattern}` });
    }
  } else if ((schemaType === 'number' || schemaType === 'integer') && typeof value === 'number') {
    const min = schema.minimum as number | undefined;
    const max = schema.maximum as number | undefined;

    if (min !== undefined && value < min) {
      errors.push({ path: '', message: `Value ${value} is less than minimum ${min}` });
    }
    if (max !== undefined && value > max) {
      errors.push({ path: '', message: `Value ${value} is greater than maximum ${max}` });
    }
  } else if (schemaType === 'array' && Array.isArray(value)) {
    const items = schema.items as Record<string, unknown> | undefined;
    const minItems = schema.minItems as number | undefined;
    const maxItems = schema.maxItems as number | undefined;

    if (minItems !== undefined && value.length < minItems) {
      errors.push({ path: '', message: `Array has too few items (minimum ${minItems})` });
    }
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push({ path: '', message: `Array has too many items (maximum ${maxItems})` });
    }

    if (items) {
      for (let i = 0; i < value.length; i++) {
        const itemErrors = validateAgainstSchema(value[i], items);
        for (const e of itemErrors) {
          errors.push({ path: `[${i}]${e.path ? '.' + e.path : ''}`, message: e.message });
        }
      }
    }
  } else if (schemaType === 'boolean' && typeof value === 'boolean') {
    // No additional validation needed for booleans
  } else if (schemaType && typeof value !== getJSType(schemaType)) {
    errors.push({ path: '', message: `Expected type "${schemaType}" but got "${typeof value}"` });
  }

  return errors;
}

function getJSType(schemaType: string): string {
  switch (schemaType) {
    case 'string': return 'string';
    case 'number':
    case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return 'object';
    case 'object': return 'object';
    default: return 'unknown';
  }
}

// ─── Schema Types (ported from Claude Code's schema types) ───

export interface SchemaProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: SchemaProperty;
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

// ─── Configuration Schema ───

export interface YourCAConfigSchema {
  api_key?: string;
  model?: string;
  theme?: string;
  autoMemoryEnabled?: boolean;
  verbose?: boolean;
  debug?: boolean;
  maxTurns?: number;
  permissionMode?: 'default' | 'accept' | 'bypass' | 'auto';
  outputStyle?: string;
}

export function validateConfig(config: Record<string, unknown>): ValidationError[] {
  return validateAgainstSchema(config, {
    type: 'object',
    properties: {
      api_key: { type: 'string', minLength: 10 },
      model: { type: 'string' },
      theme: { type: 'string', enum: ['dark', 'light', 'auto'] },
      verbose: { type: 'boolean' },
      maxTurns: { type: 'number', minimum: 1, maximum: 200 },
    },
  });
}

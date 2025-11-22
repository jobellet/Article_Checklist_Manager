/** @typedef {import('../data/guideline-types.js').Guideline} Guideline */
import { resolveUrl } from '../src/utils/url-utils.js';

const STATUS_PENDING = 'pending';
const STATUS_SUCCESS = 'success';
const STATUS_ERROR = 'error';

/**
 * Fetch a JSON resource relative to the worker location.
 * @param {string} path
 * @returns {Promise<unknown>}
 */
async function fetchJson(path) {
  const resolved = resolveUrl(path);
  const response = await fetch(resolved);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (status ${response.status})`);
  }
  return response.json();
}

/**
 * Validate a single guideline entry against the provided schema.
 * @param {Guideline} item
 * @param {any} schema
 * @param {number} index
 * @returns {string[]}
 */
function collectItemErrors(item, schema, index) {
  const errors = [];
  const required = schema.required || [];

  for (const key of required) {
    if (!(key in item)) {
      errors.push(`Entry ${index}: missing required property "${key}".`);
    }
  }

  const properties = schema.properties || {};
  for (const [key, value] of Object.entries(item)) {
    if (properties[key]) {
      const expectedType = properties[key].type;
      if (expectedType && typeof value !== expectedType) {
        errors.push(
          `Entry ${index}: property "${key}" should be ${expectedType}, received ${typeof value}.`,
        );
      }
    } else if (schema.additionalProperties === false) {
      errors.push(`Entry ${index}: unexpected property "${key}".`);
    }
  }

  return errors;
}

/**
 * Validate an array of guideline entries.
 * @param {Guideline[] | unknown} data
 * @param {any} schema
 * @returns {string[]}
 */
function validateGuidelines(data, schema) {
  if (!Array.isArray(data)) {
    return ['Guidelines file should be an array of entries.'];
  }

  const itemSchema = schema.items || {};
  const errors = [];

  data.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errors.push(`Entry ${index} should be an object.`);
      return;
    }
    errors.push(
      ...collectItemErrors(/** @type {Guideline} */ (item), itemSchema, index),
    );
  });

  return errors;
}

async function runValidation() {
  try {
    postMessage({
      status: STATUS_PENDING,
      message: 'Checking journal guidelines…',
    });

    const [guidelines, schema] = await Promise.all([
      fetchJson('journal_guidelines.json'),
      fetchJson('schemas/guideline-schema.json'),
    ]);

    const errors = validateGuidelines(
      /** @type {Guideline[]} */ (guidelines),
      schema,
    );

    if (errors.length) {
      postMessage({
        status: STATUS_ERROR,
        message: `Guideline validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}.`,
        details: errors,
      });
      return;
    }

    postMessage({
      status: STATUS_SUCCESS,
      message: `Guidelines validated (${Array.isArray(guidelines) ? guidelines.length : 0} entries).`,
    });
  } catch (error) {
    postMessage({
      status: STATUS_ERROR,
      message: `Guideline validation error: ${error.message}`,
    });
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'revalidate') {
    runValidation();
  }
});

runValidation();

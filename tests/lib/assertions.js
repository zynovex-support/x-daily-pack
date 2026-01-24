/**
 * 轻量级断言库
 */

class AssertionError extends Error {
  constructor(message, actual, expected) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
  }
}

const assert = {
  ok(value, message = 'Expected truthy value') {
    if (!value) throw new AssertionError(message, value, true);
  },

  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new AssertionError(
        message || `Expected ${expected}, got ${actual}`,
        actual, expected
      );
    }
  },

  deepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new AssertionError(
        message || 'Deep equality failed',
        actual, expected
      );
    }
  },

  includes(array, item, message) {
    if (!array.includes(item)) {
      throw new AssertionError(
        message || `Array does not include ${item}`,
        array, item
      );
    }
  },

  inRange(value, min, max, message) {
    if (value < min || value > max) {
      throw new AssertionError(
        message || `${value} not in range [${min}, ${max}]`,
        value, `[${min}, ${max}]`
      );
    }
  },

  isType(value, type, message) {
    const actualType = typeof value;
    if (actualType !== type) {
      throw new AssertionError(
        message || `Expected type ${type}, got ${actualType}`,
        actualType, type
      );
    }
  },

  isArray(value, message) {
    if (!Array.isArray(value)) {
      throw new AssertionError(
        message || 'Expected array',
        typeof value, 'array'
      );
    }
  },

  hasProperty(obj, prop, message) {
    if (!(prop in obj)) {
      throw new AssertionError(
        message || `Missing property: ${prop}`,
        Object.keys(obj), prop
      );
    }
  },

  greaterThan(actual, expected, message) {
    if (actual <= expected) {
      throw new AssertionError(
        message || `Expected ${actual} > ${expected}`,
        actual, `> ${expected}`
      );
    }
  }
};

module.exports = { assert, AssertionError };

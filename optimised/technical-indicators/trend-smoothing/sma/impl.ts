/**
 * The worked example for `optimised/` — copy this shape.
 *
 * Everything except `calculateSma` comes from the reference unchanged, which is
 * the point: an override replaces the function it makes faster and inherits the
 * rest, so it stays the size of the change rather than the size of the module.
 *
 * The reference already keeps a rolling sum, so the remaining cost is
 * allocation. It builds an intermediate array with `.map`, walks it with
 * `.forEach`, and grows the result with `push`. This preallocates the output and
 * does one pass. Validation happens in the same order and throws the same class
 * with the same message, because `test/differential.test.ts` compares thrown
 * errors as carefully as returned values.
 *
 * Measured with `npm run bench`: 2.74x. The reference stays in the article,
 * where a reader wants the version that explains itself.
 */
export * from "./reference.ts";

import { SMAValidationError } from "./reference.ts";

export function calculateSma(values: readonly number[], window: number): Array<number | null> {
  if (!Number.isSafeInteger(window) || window < 1) {
    throw new SMAValidationError("window must be a positive integer.");
  }
  if (!Array.isArray(values)) {
    throw new SMAValidationError("values must be an array.");
  }

  const length = values.length;
  const output: Array<number | null> = new Array(length);
  let rollingSum = 0;

  for (let index = 0; index < length; index += 1) {
    const value = values[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new SMAValidationError(`values[${index}] must be a finite number.`);
    }
    rollingSum += value;
    if (index >= window) rollingSum -= values[index - window] as number;
    output[index] = index >= window - 1 ? rollingSum / window : null;
  }

  return output;
}

/// <reference lib="deno.ns" />
import { assertEquals, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts"
import { normalizeNullableString, normalizeDateInput } from "../_shared/normalise.ts"

Deno.test("normalizeNullableString trims whitespace and preserves content", () => {
  assertEquals(normalizeNullableString("  Fiscalia  "), "Fiscalia")
  assertEquals(normalizeNullableString("\n\tProjet\n"), "Projet")
})

Deno.test("normalizeNullableString returns null for empty or undefined input", () => {
  assertEquals(normalizeNullableString(""), null)
  assertEquals(normalizeNullableString("   "), null)
  assertEquals(normalizeNullableString(undefined), null)
  assertEquals(normalizeNullableString(null), null)
})

Deno.test("normalizeDateInput accepts ISO strings and friendly dates", () => {
  assertEquals(normalizeDateInput("2025-03-15"), "2025-03-15")
  const parsed = normalizeDateInput("March 15, 2025")
  assert(parsed !== null, "Expected a parsed date for friendly input")
})

Deno.test("normalizeDateInput returns null for invalid values", () => {
  assertEquals(normalizeDateInput("not-a-date"), null)
  assertEquals(normalizeDateInput("2025-13-40"), null)
})


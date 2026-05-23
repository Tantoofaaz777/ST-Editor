import { Tiktoken } from "js-tiktoken/lite";
import cl100kBase from "js-tiktoken/ranks/cl100k_base";

const encoder = new Tiktoken(cl100kBase);

export function countTokens(value) {
  if (!value) return 0;
  return encoder.encode(String(value)).length;
}

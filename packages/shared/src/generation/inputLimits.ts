export const MAX_BRIEF_CHARS = 6000;
export const MAX_INSTRUCTION_CHARS = 2000;
export const MAX_DATA_CHARS = 20000;

/** Returns an error message if any generation input exceeds its cap, else null. */
export function checkGenerationInput(input: {
  brief?: string;
  instruction?: string;
  data?: unknown;
}): string | null {
  if (input.brief !== undefined && input.brief.length > MAX_BRIEF_CHARS) {
    return `Brief is too long (max ${MAX_BRIEF_CHARS} characters).`;
  }
  if (input.instruction !== undefined && input.instruction.length > MAX_INSTRUCTION_CHARS) {
    return `Instruction is too long (max ${MAX_INSTRUCTION_CHARS} characters).`;
  }
  if (input.data !== undefined && JSON.stringify(input.data).length > MAX_DATA_CHARS) {
    return `Section data is too large (max ${MAX_DATA_CHARS} characters).`;
  }
  return null;
}

const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /rm\s+(-rf?|--recursive)/i,
  /sudo\s+rm/i,
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev\//i,
  /chmod\s+777/i,
  /curl.*\|\s*(ba)?sh/i,
  /wget.*\|\s*(ba)?sh/i,
];

export function isDangerousCommand(text: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
}

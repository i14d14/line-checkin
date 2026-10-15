import {
  BubbleContainerSchema,
  FlexMessageSchema,
  BubbleContainer,
  FlexMessage,
} from "../schemas/line-flex.schema";

export class FlexValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`[LINE Flex Message Validation Error]\n` + issues.map((iss) => `  - ${iss}`).join("\n"));
    this.name = "FlexValidationError";
  }
}

/**
 * Validates and asserts that a given object complies with the LINE Flex Bubble specification.
 * Throws FlexValidationError if any property violates the official contract.
 */
export function assertValidFlexBubble(bubble: unknown): BubbleContainer {
  const result = BubbleContainerSchema.safeParse(bubble);
  if (!result.success) {
    const issues = result.error.issues.map((iss) => {
      const path = iss.path.length > 0 ? iss.path.join(".") : "(root)";
      return `${path}: ${iss.message}`;
    });
    throw new FlexValidationError(issues);
  }
  return result.data;
}

/**
 * Validates and asserts that a top-level LINE Flex Message complies with specifications.
 * Throws FlexValidationError if any property violates the official contract.
 */
export function assertValidFlexMessage(message: unknown): FlexMessage {
  const result = FlexMessageSchema.safeParse(message);
  if (!result.success) {
    const issues = result.error.issues.map((iss) => {
      const path = iss.path.length > 0 ? iss.path.join(".") : "(root)";
      return `${path}: ${iss.message}`;
    });
    throw new FlexValidationError(issues);
  }
  return result.data;
}

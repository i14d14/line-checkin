import { z } from "zod";

/**
 * LINE Messaging API v3 - Flex Message Strict Contract Schemas
 * Reference: https://developers.line.biz/en/reference/messaging-api/#flex-message
 */

// 1. Actions
export const PostbackActionSchema = z.object({
  type: z.literal("postback"),
  label: z.string().optional(),
  data: z.string().min(1).max(300),
  displayText: z.string().optional(),
  text: z.string().optional(),
  inputOption: z.enum(["openKeyboard", "openVoice", "openRichMenu"]).optional(),
  fillInText: z.string().optional(),
});

export const UriActionSchema = z.object({
  type: z.literal("uri"),
  label: z.string().optional(),
  uri: z.string().min(1),
  altUri: z.object({
    desktop: z.string().min(1),
  }).optional(),
});

export const MessageActionSchema = z.object({
  type: z.literal("message"),
  label: z.string().optional(),
  text: z.string().min(1),
});

export const FlexActionSchema = z.discriminatedUnion("type", [
  PostbackActionSchema,
  UriActionSchema,
  MessageActionSchema,
]);

export type FlexAction = z.infer<typeof FlexActionSchema>;

// Base component properties
const BaseComponentProps = {
  flex: z.number().int().min(0).optional(),
  margin: z.enum(["none", "xs", "sm", "md", "lg", "xl", "xxl"]).or(z.string()).optional(),
  position: z.enum(["relative", "absolute"]).optional(),
  offsetTop: z.string().optional(),
  offsetBottom: z.string().optional(),
  offsetStart: z.string().optional(),
  offsetEnd: z.string().optional(),
};

// 2. Components
export const TextComponentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  weight: z.enum(["regular", "bold"]).optional(),
  size: z.enum(["xxs", "xs", "sm", "md", "lg", "xl", "xxl", "3xl", "4xl", "5xl"]).or(z.string()).optional(),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/).or(z.string()).optional(),
  align: z.enum(["start", "end", "center"]).optional(),
  gravity: z.enum(["top", "bottom", "center"]).optional(),
  wrap: z.boolean().optional(),
  maxLines: z.number().int().min(1).optional(),
  action: FlexActionSchema.optional(),
  ...BaseComponentProps,
});

export const ButtonComponentSchema = z.object({
  type: z.literal("button"),
  action: FlexActionSchema,
  style: z.enum(["primary", "secondary", "link"]).optional(),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/).or(z.string()).optional(),
  height: z.enum(["sm", "md"]).optional(),
  gravity: z.enum(["top", "bottom", "center"]).optional(),
  adjustMode: z.enum(["shrink-to-fit"]).optional(),
  ...BaseComponentProps,
});

export const SeparatorComponentSchema = z.object({
  type: z.literal("separator"),
  margin: z.enum(["none", "xs", "sm", "md", "lg", "xl", "xxl"]).or(z.string()).optional(),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/).or(z.string()).optional(),
});

export const ImageComponentSchema = z.object({
  type: z.literal("image"),
  url: z.string().min(1),
  size: z.enum(["xxs", "xs", "sm", "md", "lg", "xl", "xxl", "3xl", "4xl", "5xl", "full"]).or(z.string()).optional(),
  aspectRatio: z.string().optional(),
  aspectMode: z.enum(["cover", "fit"]).optional(),
  backgroundColor: z.string().optional(),
  action: FlexActionSchema.optional(),
  ...BaseComponentProps,
});

export const IconComponentSchema = z.object({
  type: z.literal("icon"),
  url: z.string().min(1),
  size: z.enum(["xxs", "xs", "sm", "md", "lg", "xl", "xxl", "3xl", "4xl", "5xl"]).or(z.string()).optional(),
  aspectRatio: z.string().optional(),
  ...BaseComponentProps,
});

export const SpanComponentSchema = z.object({
  type: z.literal("span"),
  text: z.string(),
  color: z.string().optional(),
  size: z.string().optional(),
  weight: z.enum(["regular", "bold"]).optional(),
  style: z.enum(["normal", "italic"]).optional(),
  decoration: z.enum(["none", "underline", "line-through"]).optional(),
});

// Recursive Box Component
export type FlexComponent =
  | z.infer<typeof TextComponentSchema>
  | z.infer<typeof ButtonComponentSchema>
  | z.infer<typeof SeparatorComponentSchema>
  | z.infer<typeof ImageComponentSchema>
  | z.infer<typeof IconComponentSchema>
  | BoxComponent;

export interface BoxComponent {
  type: "box";
  layout: "horizontal" | "vertical" | "baseline";
  contents: FlexComponent[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  cornerRadius?: string;
  width?: string;
  height?: string;
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  action?: FlexAction;
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
  alignItems?: "flex-start" | "center" | "flex-end";
  flex?: number;
  position?: "relative" | "absolute";
  offsetTop?: string;
  offsetBottom?: string;
  offsetStart?: string;
  offsetEnd?: string;
}

export const BoxComponentSchema: z.ZodType<BoxComponent> = z.lazy(() =>
  z.object({
    type: z.literal("box"),
    layout: z.enum(["horizontal", "vertical", "baseline"]),
    contents: z.array(FlexComponentSchema),
    backgroundColor: z.string().optional(),
    borderColor: z.string().optional(),
    borderWidth: z.string().optional(),
    cornerRadius: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    spacing: z.string().optional(),
    paddingAll: z.string().optional(),
    paddingTop: z.string().optional(),
    paddingBottom: z.string().optional(),
    paddingStart: z.string().optional(),
    paddingEnd: z.string().optional(),
    action: FlexActionSchema.optional(),
    justifyContent: z.enum(["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"]).optional(),
    alignItems: z.enum(["flex-start", "center", "flex-end"]).optional(),
    ...BaseComponentProps,
  })
);

export const FlexComponentSchema: z.ZodType<FlexComponent> = z.lazy(() =>
  z.union([
    TextComponentSchema,
    ButtonComponentSchema,
    SeparatorComponentSchema,
    ImageComponentSchema,
    IconComponentSchema,
    BoxComponentSchema,
  ])
);

// 3. Containers
export const BubbleContainerSchema = z.object({
  type: z.literal("bubble"),
  size: z.enum(["nano", "micro", "kilo", "mega", "giga"]).optional(),
  direction: z.enum(["ltr", "rtl"]).optional(),
  header: BoxComponentSchema.optional(),
  hero: z.union([BoxComponentSchema, ImageComponentSchema]).optional(),
  body: BoxComponentSchema.optional(),
  footer: BoxComponentSchema.optional(),
  styles: z.record(z.string(), z.record(z.string(), z.string().optional()).optional()).optional(),
  action: FlexActionSchema.optional(),
});

export type BubbleContainer = z.infer<typeof BubbleContainerSchema>;

export const CarouselContainerSchema = z.object({
  type: z.literal("carousel"),
  contents: z.array(BubbleContainerSchema).min(1).max(12),
});

export type CarouselContainer = z.infer<typeof CarouselContainerSchema>;

export const FlexContainerSchema = z.union([
  BubbleContainerSchema,
  CarouselContainerSchema,
]);

export type FlexContainer = z.infer<typeof FlexContainerSchema>;

// 4. Top-level Flex Message
export const FlexMessageSchema = z.object({
  type: z.literal("flex"),
  altText: z.string().min(1, "altText cannot be empty").max(400, "altText cannot exceed 400 chars"),
  contents: FlexContainerSchema,
});

export type FlexMessage = z.infer<typeof FlexMessageSchema>;

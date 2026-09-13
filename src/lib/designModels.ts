export const DESIGN_MODELS = [
  { id: "openai/gpt-6-astra", label: "Astra", hint: "Production-grade product systems and polished UI" },
] as const;

export type DesignModelId = (typeof DESIGN_MODELS)[number]["id"];

export const DEFAULT_DESIGN_MODEL: DesignModelId = "openai/gpt-6-astra";

export function resolveDesignModel(input: unknown): DesignModelId {
  if (typeof input !== "string") return DEFAULT_DESIGN_MODEL;
  return (DESIGN_MODELS.find((m) => m.id === input)?.id ?? DEFAULT_DESIGN_MODEL) as DesignModelId;
}

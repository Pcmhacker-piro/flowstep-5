import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ prompt: z.string().min(1).max(2000) });

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: `Generate a clean, modern UI design mockup for: ${data.prompt}. High quality, minimal, professional.`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit exceeded. Please try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits.");
      throw new Error(`AI error: ${text}`);
    }

    const json = await res.json();
    const images = json?.choices?.[0]?.message?.images;
    const url = images?.[0]?.image_url?.url as string | undefined;
    if (!url) throw new Error("No image returned");
    return { url };
  });

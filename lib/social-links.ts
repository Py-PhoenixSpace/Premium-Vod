import { z } from "zod";

export const SOCIAL_LINKS_SETTINGS_COLLECTION = "platformSettings";
export const SOCIAL_LINKS_SETTINGS_DOC_ID = "socialLinks";

export interface SocialLinks {
  instagram: string;
  twitter: string;
  whatsapp: string;
}

export const DEFAULT_SOCIAL_LINKS: SocialLinks = {
  instagram: "https://instagram.com",
  twitter: "https://twitter.com",
  whatsapp: "https://www.whatsapp.com",
};

const absoluteHttpUrl = z
  .string({ message: "URL is required" })
  .trim()
  .min(1, "URL is required")
  .max(500, "URL is too long")
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid URL",
      });
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: "URL must start with http:// or https://",
      });
    }
  });

export const socialLinksSchema = z.object({
  instagram: absoluteHttpUrl,
  twitter: absoluteHttpUrl,
  whatsapp: absoluteHttpUrl,
});

const socialLinksStorageSchema = z.object({
  instagram: absoluteHttpUrl.optional(),
  twitter: absoluteHttpUrl.optional(),
  whatsapp: absoluteHttpUrl.optional(),
});

export function normalizeSocialLinks(input: unknown): SocialLinks {
  const parsed = socialLinksStorageSchema.safeParse(input);
  if (parsed.success) {
    return {
      instagram: parsed.data.instagram || DEFAULT_SOCIAL_LINKS.instagram,
      twitter: parsed.data.twitter || DEFAULT_SOCIAL_LINKS.twitter,
      whatsapp: parsed.data.whatsapp || DEFAULT_SOCIAL_LINKS.whatsapp,
    };
  }
  return DEFAULT_SOCIAL_LINKS;
}

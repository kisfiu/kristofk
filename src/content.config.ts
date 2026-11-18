import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const place = z.enum(["desktop", "hobbies", "ngos", "other", "games"]);

const items = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/items" }),
  schema: z.object({
    title: z.string(),
    /** Name shown under the icon; defaults to title. */
    label: z.string().optional(),
    icon: z.string(),
    /** Where the icon sits: on the desktop or inside a folder window. */
    parent: place,
    order: z.number(),
    /** This item is a folder: its window lists the items whose parent is this value. */
    folder: place.exclude(["desktop"]).optional(),
    /** Shortcut: clicking opens another item instead of its own window. */
    opens: z.string().optional(),
    /** Built-in app rendered instead of Markdown. */
    app: z
      .enum(["pipeline", "internet", "renovation", "sweeper", "solitaire", "freecell", "spider", "hearts", "pinball"])
      .optional(),
    width: z.number().default(460),
    links: z.array(z.object({ label: z.string(), href: z.url() })).default([]),
  }),
});

export const collections = { items };

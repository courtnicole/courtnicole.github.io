import { z, defineCollection } from 'astro:content';

const updatesSchema = z.object({
  title: z.string(),
  pubDate: z.coerce.date(),
});

const updatesCollection = defineCollection({
  type: 'content', schema: updatesSchema
});

export const collections = {
  'updates': updatesCollection,
};
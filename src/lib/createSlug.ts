// Taken from https://github.com/manuelernestog/astrofy/blob/main/src/config.ts
// Adapted from https://equk.co.uk/2023/02/02/generating-slug-from-title-in-astro/

export default function (title: string, staticSlug: string) {
    const GENERATE_SLUG_FROM_TITLE = false
  return (
    !GENERATE_SLUG_FROM_TITLE ? staticSlug : title
      // remove leading & trailing whitespace
      .trim()
      // output lowercase
      .toLowerCase()
      // replace spaces
      .replace(/\s+/g, '-')
      // remove special characters
      .replace(/[^\w-]/g, '')
      // remove leading & trailing separtors
      .replace(/^-+|-+$/g, '')
  )
}
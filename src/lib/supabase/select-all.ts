/**
 * Every row of a query, in pages. The database answers at most 1000 rows per request whatever `limit` says, so a plain `.limit(20000)` quietly returns only the first 1000
 * (the car files are past that). `page(from, to)` runs the query for one range of rows; the first pages are asked at the same time, and more are asked while a page comes back full.
 */
export async function selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 1000, first = 4): Promise<T[]> {
  const out: T[] = [];
  const pages = await Promise.all(Array.from({ length: first }, (_, i) => page(i * size, i * size + size - 1)));
  for (const p of pages) { if (p.error) throw new Error(p.error.message); out.push(...(p.data ?? [])); }
  let last = pages[pages.length - 1].data?.length ?? 0;
  for (let n = first; last === size; n++) {
    const p = await page(n * size, n * size + size - 1);
    if (p.error) throw new Error(p.error.message);
    out.push(...(p.data ?? [])); last = p.data?.length ?? 0;
  }
  return out;
}

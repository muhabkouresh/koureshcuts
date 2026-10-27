import { after } from "next/server";

/** Keep serverless work alive after the response; one failed task must not stop others. */
export function afterResponse(tasks: Record<string, () => Promise<unknown>>) {
  after(async () => {
    await Promise.all(Object.entries(tasks).map(async ([label, run]) => {
      try { await run(); } catch (error) { console.error(label, error); }
    }));
  });
}

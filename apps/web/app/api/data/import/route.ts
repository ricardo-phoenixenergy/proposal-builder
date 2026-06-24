import { NextResponse } from "next/server";
import { csvToDataset } from "../../../../src/server/csvToDataset";
import { requireOwner } from "../../../../src/server/auth/guard";

/**
 * POST /api/data/import — parse an uploaded CSV into a normalized Dataset (§10.2).
 * XLSX support is deferred to a later slice. Runs as a Vercel function.
 */
export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected a 'file' field" }, { status: 400 });
  }
  const MAX_CSV_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV is too large (max 5 MB)." }, { status: 413 });
  }
  const text = await file.text();
  const dataset = csvToDataset(text);
  return NextResponse.json({ dataset });
}

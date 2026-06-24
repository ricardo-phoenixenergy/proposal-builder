import Papa from "papaparse";
import { tableToDataset, type Dataset } from "@proposal/shared";

/**
 * Parse CSV text into the canonical Dataset. Uses PapaParse for correct quoting/
 * escaping, then hands the cell grid to the shared `tableToDataset` so CSV and
 * clipboard-TSV produce identical Datasets.
 */
export function csvToDataset(csv: string): Dataset {
  const result = Papa.parse<string[]>(csv, { skipEmptyLines: true });
  const table = result.data.map((row) => row.map((cell) => cell ?? ""));
  return tableToDataset(table);
}

import { DEFAULT_MODEL, type GenerationModelId } from "@proposal/shared";
import { getRepo } from "./repo";

/** The model every generation call uses: the admin setting, or the default when unset. */
export async function getActiveModel(): Promise<GenerationModelId> {
  return (await getRepo().getAiModel()) ?? DEFAULT_MODEL;
}

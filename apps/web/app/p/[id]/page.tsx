import { App } from "../../../src/App";

type Ctx = { params: Promise<{ id: string }> };

/** Editor for a single proposal. The client shell loads it by id (App). */
export default async function ProposalEditorPage({ params }: Ctx) {
  const { id } = await params;
  return <App id={id} />;
}

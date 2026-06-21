import { App } from "../../../src/App";
import { getSessionUser } from "../../../src/server/auth/sessionUser";

type Ctx = { params: Promise<{ id: string }> };

/** Editor for a single proposal. The client shell loads it by id (App). */
export default async function ProposalEditorPage({ params }: Ctx) {
  const { id } = await params;
  const user = await getSessionUser();
  return <App id={id} isAdmin={user?.isAdmin === true} />;
}

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "../../auth";

/** Sign-in (§13.10). Server action calls Auth.js; invalid credentials bounce back with ?error=1. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (err) {
      if (err instanceof AuthError) redirect("/signin?error=1");
      throw err; // re-throw the framework redirect on success
    }
  }

  return (
    <main className="signin">
      <form className="signin__card" action={authenticate}>
        <h1 className="signin__title">Proposal Generator</h1>
        <p className="signin__sub">Sign in to continue</p>
        {error ? (
          <p role="alert" className="signin__error">
            Incorrect email or password.
          </p>
        ) : null}
        <label className="signin__field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="signin__field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="btn btn--primary signin__submit">
          Sign in
        </button>
      </form>
    </main>
  );
}

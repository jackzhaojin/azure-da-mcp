import { redirect } from "next/navigation";
import { auth, authEnabled, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Google sign-in. Auth disabled (no AUTH_GOOGLE_* env) → straight through. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const target = callbackUrl?.startsWith("/") ? callbackUrl : "/";
  if (!authEnabled || (await auth())?.user) redirect(target);

  return (
    <div className="flex justify-center pt-20">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            The coordinator dashboard uses your Google account — runs you trigger are tied to it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-red-600">
              {error === "AccessDenied"
                ? "This Google account isn't on the allowlist for this dashboard."
                : "Sign-in failed — please try again."}
            </p>
          )}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: target });
            }}
          >
            <Button type="submit" className="w-full">
              Continue with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

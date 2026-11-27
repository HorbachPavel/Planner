export const minPasswordLength = 12;

/** Explains a Firebase sign-in error in plain words. */
export function authMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/email-already-in-use":
      return "There is already an account with this email. Sign in instead.";
    case "auth/invalid-email":
      return "This email address doesn’t look right.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return `Choose a stronger password, at least ${minPasswordLength} characters.`;
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "No connection. Check the internet and try again.";
    default:
      return `Something went wrong${code ? ` (${code})` : ""}. Try again.`;
  }
}

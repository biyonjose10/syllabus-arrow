import { createAuthClient } from "better-auth/react";

/** Browser-side auth calls. Same origin as the app, so no base URL is needed. */
export const authClient = createAuthClient();

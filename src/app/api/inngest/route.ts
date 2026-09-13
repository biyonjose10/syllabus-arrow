import { serve } from "inngest/next";

import { ingestDocument } from "@/lib/ingest/functions";
import { inngest } from "@/lib/inngest";

/**
 * Inngest calls this endpoint once per step. Each step is its own invocation,
 * so no single one has to outlast a slow model call plus everything else.
 */
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [ingestDocument] });

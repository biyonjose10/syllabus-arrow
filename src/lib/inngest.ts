import { Inngest } from "inngest";

/**
 * The background-job client. Keys come from the Inngest Vercel integration
 * (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY); locally, INNGEST_DEV=1 points it
 * at `npx inngest-cli@latest dev`.
 */
export const inngest = new Inngest({ id: "syllabus-arrow" });

/** A document was uploaded and registered. data: { jobId, workspaceId } */
export const DOCUMENT_UPLOADED = "document/uploaded";

/** A syllabus map was saved; practice questions can be written. data: { courseId, workspaceId } */
export const COURSE_MAP_READY = "course/map-ready";

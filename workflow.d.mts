/** Sends the visitor back to the step they skipped, or returns the room. See workflow.mjs. */
export function gateWorkflow(page: "inspo" | "result"): Promise<Record<string, unknown> | null>;
/** The ?missing= reason this page was opened with, removed from the URL. */
export function takeMissingReason(): string | null;

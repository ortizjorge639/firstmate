// Extension: firstmate-console
// Send tasks to the firstmate first mate (tmux) and view fleet status
//
// This single-file skeleton is a starting point. For more complex canvases
// (multiple actions with non-trivial logic, shared state, a custom renderer,
// etc.) prefer splitting things out: move each action handler into its own
// function, extract `open`/`onClose` into helpers, and pull large units
// (renderer assets, schema definitions, shared utilities) into sibling files
// imported from this entry point. Keep extension.mjs focused on wiring.

import { joinSession, createCanvas } from "@github/copilot-sdk/extension";
import { startServer, buildMessage, sendToFirstMate, fleetStatus } from "./console.mjs";

const servers = new Map();

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "firstmate-console",
            displayName: "Firstmate console",
            description: "Form to send scout/ship tasks to the firstmate first mate (tmux) with live fleet status.",
            actions: [
                {
                    name: "send_task",
                    description: "Send a task to the first mate's tmux pane",
                    inputSchema: {
                        type: "object",
                        properties: {
                            project: { type: "string" },
                            kind: { type: "string", enum: ["scout", "ship"] },
                            mode: { type: "string", enum: ["local-only", "direct-PR", "no-mistakes"] },
                            task: { type: "string" },
                        },
                        required: ["project", "kind", "mode", "task"],
                    },
                    handler: async (ctx) => sendToFirstMate(buildMessage(ctx.input)),
                },
                {
                    name: "status",
                    description: "Return whether the first mate is running plus the fleet overview",
                    handler: async () => fleetStatus(),
                },
            ],
            // Called when the agent or host opens the canvas. We boot a local
            // HTTP server on an ephemeral port and hand its URL back to the
            // host so it can render the canvas. Re-opens with the same
            // instanceId reuse the existing server.
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer();
                    servers.set(ctx.instanceId, entry);
                }
                return {
                    title: "Firstmate",
                    url: entry.url,
                };
            },
            // Tear the per-instance server down when the canvas is closed so
            // ports are not leaked across the lifetime of the extension.
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});

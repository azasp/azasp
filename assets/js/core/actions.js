// Shared asynchronous action lifecycle for Supabase writes.
// Dependencies are injected during application initialization to keep this
// core helper independent from application state and rendering modules.
let actionDependencies = null;

function configureActions(dependencies) {
    const required = ["load", "draw", "msg", "isBusy", "setBusy"];
    const missing = required.filter(key => typeof dependencies?.[key] !== "function");
    if (missing.length) throw new Error("Missing action dependencies: " + missing.join(", "));
    actionDependencies = dependencies;
}

async function act(operation) {
    if (!actionDependencies) throw new Error("Actions have not been configured.");
    const d = actionDependencies;
    if (d.isBusy()) return;

    d.setBusy(true);
    d.msg("Saving…");
    let succeeded = false;
    try {
        const { error } = await operation;
        if (error) {
            d.msg(error.message || "The operation failed.");
            return;
        }
        await d.load();
        succeeded = true;
        d.msg("");
    } catch (error) {
        d.msg(error?.message || String(error));
    } finally {
        d.setBusy(false);
        if (succeeded) d.draw();
    }
}

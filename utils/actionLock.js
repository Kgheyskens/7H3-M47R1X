// A double-click (or Discord redelivering a slow interaction) can fire the same bulk role
// action twice before the first run finishes, and both runs see the same "not created yet"
// state — that's how duplicate roles happen. This is a simple in-memory mutex per guild to
// stop that; it only needs to survive the process's lifetime, not a restart.
const active = new Set();

function acquireLock(key) {
    if (active.has(key)) return false;
    active.add(key);
    return true;
}

function releaseLock(key) {
    active.delete(key);
}

module.exports = { acquireLock, releaseLock };

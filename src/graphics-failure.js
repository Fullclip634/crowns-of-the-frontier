// A failed native device/backend cannot be repaired by rebuilding its scene.
export function graphicsNeedsReload(failure){return !!(failure?.deviceLost||failure?.backendError);}

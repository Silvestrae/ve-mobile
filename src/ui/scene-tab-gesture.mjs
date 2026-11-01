/** Defer pointer navigation so a pause double tap never also opens the chooser. */
export function createSceneTabGesture({ scope, canPause, blocked, onSingle, onDouble }) {
  let pending = null;
  // Dispose the deferred single tap so it cannot navigate after a double tap or teardown.
  const cancel = () => { pending?.dispose(); pending = null; };
  scope.own(cancel);
  return Object.freeze({
    cancel,
    // Defer an eligible first tap, consume a second as pause, and keep keyboard activation immediate.
    tap(event) {
      if (blocked()) { cancel(); return; }
      if (!canPause() || event.detail === 0) { cancel(); onSingle(); return; }
      if (pending) { cancel(); onDouble(); return; }
      pending = scope.child("scene-tab-tap");
      pending.timeout(() => {
        cancel();
        if (!scope.disposed && !blocked()) onSingle();
      }, 300);
    }
  });
}

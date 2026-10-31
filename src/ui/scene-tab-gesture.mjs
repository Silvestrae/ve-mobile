/** Defer pointer navigation so a pause double tap never also opens the chooser. */
export function createSceneTabGesture({ scope, canPause, blocked, onSingle, onDouble }) {
  let pending = null;
  const cancel = () => { pending?.dispose(); pending = null; };
  scope.own(cancel);
  return Object.freeze({
    cancel,
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

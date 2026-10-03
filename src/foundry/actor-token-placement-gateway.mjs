import { resolveActorSource } from "./character-source.mjs";

/** One native Actor drop boundary shared by direct Split drag and staged Place. */
export function createActorTokenPlacementGateway({
  getGame = () => globalThis.game,
  getCanvas = () => globalThis.canvas,
  getHooks = () => globalThis.Hooks
} = {}) {
  let preview = null;
  let creating = false;
  let previewGeneration = 0;
  const error = (key, fallback) => {
    const id = `VEMOBILE.Scene.ActorToken.${key}`;
    const localized = getGame()?.i18n?.localize?.(id);
    return new Error(localized && localized !== id ? localized : fallback);
  };

  const resolve = (sourceUuid, sceneId) => {
    const game = getGame();
    const canvas = getCanvas();
    if (!game?.user?.can?.("TOKEN_CREATE") || !canvas?.ready || !canvas?.stage
      || !canvas?.scene || String(canvas.scene.id) !== String(sceneId)
      || !canvas?.tokens?.getMaxSort || !canvas?.canvasCoordinatesFromClient
      || !globalThis.CONFIG?.Token?.objectClass?._getDropActorPosition) return null;
    const source = resolveActorSource(sourceUuid, { game });
    if (!source) return null;
    // Native Actor Directory drag is a world Actor operation. A linked token
    // resolves to that exact prototype; unlinked ActorDelta is unavailable.
    const actor = source.isToken
      ? source.token?.actorLink ? game.actors?.get?.(source.token.actorId) : null
      : source;
    if (!actor || actor.isToken || !actor.isOwner || !actor.uuid || actor.id !== source.id) return null;
    return { actor, canvas, game };
  };

  const eligibility = (sourceUuid, sceneId) => Boolean(resolve(sourceUuid, sceneId));

  const pointAt = (canvas, clientPoint) => {
    if (!Number.isFinite(clientPoint?.x) || !Number.isFinite(clientPoint?.y)) return null;
    const point = canvas.canvasCoordinatesFromClient(clientPoint);
    return canvas.dimensions?.rect?.contains?.(point.x, point.y) ? point : null;
  };

  const nativeDrop = async (sourceUuid, sceneId, clientPoint, appearance = null, validate = () => true) => {
    if (creating) return false;
    if (!validate()) return false;
    const target = resolve(sourceUuid, sceneId);
    if (!target) throw error("Unavailable", "Token creation is no longer available for this Actor and Scene.");
    const point = pointAt(target.canvas, clientPoint);
    if (!point) throw error("OutsideScene", "Choose a location on the visible Scene.");
    creating = true;
    try {
      const data = { ...target.actor.toDragData(), x: point.x, y: point.y };
      if (data.type !== "Actor" || data.uuid !== target.actor.uuid) throw error("SourceChanged", "The Actor drag source changed.");
      const transfer = typeof DataTransfer === "function" ? new DataTransfer() : null;
      transfer?.setData?.("text/plain", JSON.stringify(data));
      const event = typeof DragEvent === "function"
        ? new DragEvent("drop", { clientX: clientPoint.x, clientY: clientPoint.y, dataTransfer: transfer, bubbles: true })
        : { clientX: clientPoint.x, clientY: clientPoint.y, altKey: false, shiftKey: false, dataTransfer: transfer };
      if (getHooks()?.call?.("dropCanvasData", target.canvas, data, event) === false) return false;
      if (data.type !== "Actor" || data.uuid !== target.actor.uuid
        || !target.canvas.dimensions?.rect?.contains?.(data.x, data.y)) return false;
      // Revalidate after third-party hooks; they may change world state.
      const current = resolve(sourceUuid, sceneId);
      if (!validate() || !current || current.actor !== target.actor) throw error("Unavailable", "Token creation became unavailable.");
      const sort = Math.max(current.canvas.tokens.getMaxSort() + 1, 0);
      // getTokenDocument is Foundry's prototype-token preparation. Supplying
      // the preview's resolved artwork preserves randomImg while re-reading
      // all current prototype settings and append-number behavior.
      const override = { hidden: false, sort };
      if (appearance?.img) override.texture = { src: appearance.img };
      const token = await current.actor.getTokenDocument(override, { parent: current.canvas.scene });
      const afterPreparation = resolve(sourceUuid, sceneId);
      if (!validate() || !afterPreparation || afterPreparation.actor !== current.actor || afterPreparation.canvas.scene !== current.canvas.scene) {
        throw error("Unavailable", "Token creation became unavailable.");
      }
      if (appearance && (String(token.texture?.src ?? "") !== appearance.img
        || Number(token.width) !== appearance.width || Number(token.height) !== appearance.height)) {
        throw error("PrototypeChanged", "The Actor's prototype Token changed during placement.");
      }
      const position = globalThis.CONFIG.Token.objectClass._getDropActorPosition(token,
        { x: data.x, y: data.y }, { snap: true });
      token.updateSource(position);
      current.canvas.tokens.activate();
      return await token.constructor.create(token, { parent: current.canvas.scene }) || false;
    } finally {
      creating = false;
    }
  };

  return Object.freeze({
    eligibility,
    drop: (sourceUuid, sceneId, point, validate) => nativeDrop(sourceUuid, sceneId, point, null, validate),
    async prepare(sourceUuid, sceneId, validate = () => true) {
      if (preview) return null;
      const generation = ++previewGeneration;
      if (!validate()) return null;
      const target = resolve(sourceUuid, sceneId);
      if (!target || typeof target.actor.getTokenDocument !== "function") return null;
      const token = await target.actor.getTokenDocument({}, { parent: target.canvas.scene });
      const afterPreparation = resolve(sourceUuid, sceneId);
      if (generation !== previewGeneration || !validate() || !afterPreparation
        || afterPreparation.actor !== target.actor || afterPreparation.canvas.scene !== target.canvas.scene) return null;
      preview = { sourceUuid, sceneId, token, point: null };
      return Object.freeze({ img: String(token.texture?.src ?? target.actor.img ?? ""),
        width: Number(token.width) || 1, height: Number(token.height) || 1 });
    },
    previewAt(clientPoint = null) {
      if (!preview) return null;
      const target = resolve(preview.sourceUuid, preview.sceneId);
      if (!target) return null;
      if (clientPoint) {
        const point = pointAt(target.canvas, clientPoint);
        if (!point) return null;
        preview.point = point;
      }
      if (!preview.point) return null;
      const position = globalThis.CONFIG?.Token?.objectClass?._getDropActorPosition?.(
        preview.token, preview.point, { snap: true });
      if (!position) return null;
      const center = preview.token.getCenterPoint(position);
      const client = target.canvas.clientCoordinatesFromCanvas(center);
      const scale = Number(target.canvas.stage.scale?.x) || 1;
      const grid = Number(target.canvas.dimensions?.size) || 100;
      return Object.freeze({ x: client.x, y: client.y,
        width: Math.max(20, preview.token.width * grid * scale),
        height: Math.max(20, preview.token.height * grid * scale) });
    },
    async commit(sourceUuid, sceneId, validate) {
      if (!preview || preview.sourceUuid !== sourceUuid || preview.sceneId !== sceneId || !preview.point) return false;
      const target = resolve(sourceUuid, sceneId);
      if (!target) throw error("Unavailable", "Token placement is no longer available.");
      const center = target.canvas.clientCoordinatesFromCanvas(preview.point);
      return nativeDrop(sourceUuid, sceneId, center, {
        img: String(preview.token.texture?.src ?? ""),
        width: Number(preview.token.width), height: Number(preview.token.height)
      }, validate);
    },
    cancel() { previewGeneration += 1; preview = null; }
  });
}

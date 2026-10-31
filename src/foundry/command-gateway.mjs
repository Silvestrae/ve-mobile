import { localizeFoundry } from "./localization.mjs";
import { ACTOR_COMMANDS } from "../kernel/command-names.mjs";
import { SCENE_RETURN_COMMANDS } from "../kernel/action-scene-return.mjs";
import { actorSourceUuid, resolveActorSource, speakerMatchesActor, validSourceUuid } from "./character-source.mjs";
import { CommandError, canOwn, assertSession, identifier } from "./command-support.mjs";
import { selectSystemIntegration, assertSystemIntegration } from "./system-integration.mjs";
export { ACTOR_COMMANDS, CommandError };

/**
 * The only write/action boundary used by the renderer. Commands are
 * allowlisted, resolve fresh Foundry documents, and re-check the current
 * session and ownership immediately before invoking a system API.
 */
export function createFoundryCommandGateway({
  getGame = () => globalThis.game,
  getHooks = () => globalThis.Hooks,
  getNotifications = () => globalThis.ui?.notifications,
  getConnectionGeneration = () => 0,
  systemIntegration = selectSystemIntegration(getGame()?.system?.id ?? "dnd5e")
} = {}) {
  const inFlight = new Set();

  const { actions, messages } = systemIntegration;
  const { handlers } = actions;
  const revealMessage = message => messages.canReveal ? messages.canReveal(message, getGame()) : canRevealMessage(message);

  return Object.freeze({
    notifyError(error) {
      const message = error?.message ?? localizeFoundry("VEMOBILE.Character.CommandGateway.TheFoundryActionFailed", "The Foundry action failed.");
      getNotifications()?.error?.(message);
      return message;
    },
    capabilitiesForActor(actor, user = getGame()?.user) {
      assertSystemIntegration(systemIntegration, getGame());
      return actions.capabilitiesForActor(actor, user);
    },

    readDefenseEditor(payload, expectedSession = {}) {
      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      assertSystemIntegration(systemIntegration, game);
      const actor = resolveActorSource(validSourceUuid(payload.actorSourceUuid), { game });
      if (!actor) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
      if (!canOwn(actor, game.user)) throw new CommandError("FORBIDDEN", localizeFoundry("VEMOBILE.Character.CommandGateway.YouNoLongerHavePermissionToControlThisActor", "You no longer have permission to control this actor."));
      if (typeof actions.readDefenseEditor !== "function" || !actions.capabilitiesForActor(actor, game.user).editDefenses) throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.Unavailable", "This PF2e action is unavailable."));
      return actions.readDefenseEditor(actor);
    },
    readItemMenu(payload, expectedSession = {}) {
      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      assertSystemIntegration(systemIntegration, game);
      const actor = resolveActorSource(validSourceUuid(payload.actorSourceUuid), { game });
      if (!actor) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
      if (!canOwn(actor, game.user)) throw new CommandError(localizeFoundry("VEMOBILE.Character.CommandGateway.FORBIDDEN", "FORBIDDEN"), localizeFoundry("VEMOBILE.Character.CommandGateway.YouNoLongerHavePermissionToControlThisActor", "You no longer have permission to control this actor."));
      return actions.readItemMenu(actor, payload, game.user);
    },

    async execute(name, payload = {}, expectedSession = {}, observer = {}) {
      const handler = Object.hasOwn(handlers, name) ? handlers[name] : null;
      if (!handler) throw new CommandError("UNKNOWN_COMMAND", localizeFoundry("VEMOBILE.Character.CommandGateway.UnsupportedCommand", "Unsupported command: {name}", { name: String(name) }));

      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      assertSystemIntegration(systemIntegration, game);
      let sourceUuid;
      const explicitSourceUuid = Boolean(payload.actorSourceUuid);
      try { sourceUuid = validSourceUuid(payload.actorSourceUuid || (payload.actorId ? `Actor.${identifier(payload.actorId, "actorId")}` : "")); }
      catch (error) { throw new CommandError("INVALID_INPUT", error.message, { cause: error }); }
      const fingerprint = actions.fingerprint(name, sourceUuid, payload);
      if (inFlight.has(fingerprint)) {
        throw new CommandError("COMMAND_BUSY", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActionIsAlreadyRunning", "This action is already running."));
      }

      inFlight.add(fingerprint);
      let actionCapture = null;
      let templateUsage = null;
      let announcedActionSession = null;
      let acceptanceAnnounced = false;
      const diceWaiter = name === ACTOR_COMMANDS.USE_ITEM ? null : createDiceSoNiceWaiter(game, getHooks);
      try {
        const actor = resolveActorSource(sourceUuid, { game });
        if (!actor) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
        if (!canOwn(actor, game.user)) {
          throw new CommandError(localizeFoundry("VEMOBILE.Character.CommandGateway.FORBIDDEN", "FORBIDDEN"), localizeFoundry("VEMOBILE.Character.CommandGateway.YouNoLongerHavePermissionToControlThisActor", "You no longer have permission to control this actor."));
        }
        actions.assertActorCommand(actor, name);
        const actorId = String(actor.id ?? "");
        const actionItem = name === ACTOR_COMMANDS.USE_ITEM ? actions.resolveItem(actor, payload.itemId) : null;
        const canRevealActionMessage = message => revealMessage(message) && (!actionItem || !messages.rootMatches || messages.rootMatches(message, actor, actionItem));
        const actionTargets = actionItem ? Array.from(game.user?.targets ?? [], (target) => target?.document ?? target).filter((target) => target?.id) : [];
        const actionTargetIds = actionTargets.map((target) => String(target.id));
        // A GM can see every targeted token. Other users get identities only
        // from the native, permission-filtered chat card after it renders.
        const actionTargetPreviews = game.user?.isGM ? actionTargets.map((target) => Object.freeze({
          id: String(target.id),
          name: String(target.name ?? target.actor?.name ?? "Target").slice(0, 100),
          img: String(target._source?.texture?.src ?? target.texture?.src ?? "")
        })) : [];
        const existingMessageIds = new Set(messageDocuments(game).map(messageIdentifier).filter(Boolean));
        const announceAccepted = (message, { returned = false, userId } = {}) => {
          if (acceptanceAnnounced || typeof observer?.onActionAccepted !== "function"
            || !SCENE_RETURN_COMMANDS.includes(name) || !revealMessage(message)
            || !messageIdentifier(message) || existingMessageIds.has(messageIdentifier(message))) return;
          if (!returned && !messages.acceptsAction(message, actor, actionItem, name, payload, game.user.id, userId)) return;
          acceptanceAnnounced = true;
          const record = Object.freeze({ command: name, actorSourceUuid: sourceUuid,
            itemId: String(actionItem?.id ?? ""), messageId: messageIdentifier(message) });
          queueMicrotask(() => {
            try {
              const currentGame = getGame();
              assertSession(currentGame, expectedSession, getConnectionGeneration);
              assertSystemIntegration(systemIntegration, currentGame);
              if (currentGame !== game || resolveActorSource(sourceUuid, { game: currentGame }) !== actor || !canOwn(actor, currentGame.user)) return;
              observer.onActionAccepted(record);
            } catch (error) {
              console.warn("VE Mobile | Action acceptance observer failed", error);
            }
          });
        };
        const announceActionSession = (output) => {
          if (expectedSession.connectionGeneration !== undefined
            && expectedSession.connectionGeneration !== getConnectionGeneration()) return null;
          if (!actionItem) return null;
          if (templateUsage?.pending) return null;
          const session = actionSessionFromNewMessages(
            game,
            existingMessageIds,
            actor,
            actionItem,
            output,
            actionCapture?.messages,
            explicitSourceUuid,
            actionTargetIds,
            actionTargetPreviews,
            messages
          );
          if (!session) return null;
          if (announcedActionSession && JSON.stringify(announcedActionSession) === JSON.stringify(session)) return announcedActionSession;
          announcedActionSession = session;
          if (typeof observer?.onActionSession === "function") {
            queueMicrotask(() => {
              try {
                if (expectedSession.connectionGeneration !== undefined
                  && expectedSession.connectionGeneration !== getConnectionGeneration()) return;
                observer.onActionSession(session);
              } catch (error) {
                console.warn("VE Mobile | Action session observer failed", error);
              }
            });
          }
          return session;
        };
        actionCapture = actionItem || (typeof observer?.onActionAccepted === "function" && SCENE_RETURN_COMMANDS.includes(name))
          ? beginActionMessageCapture(getHooks(), existingMessageIds, (message, userId) => {
            announceActionSession();
            announceAccepted(message, { userId });
          })
          : null;
        if (actionItem) templateUsage = messages.watchItemUsage(getHooks(), actor, actionItem, announceActionSession);
        const output = await handler(actor, payload, { assertCurrent() {
          const currentGame = getGame();
          assertSession(currentGame, expectedSession, getConnectionGeneration);
          assertSystemIntegration(systemIntegration, currentGame);
          if (currentGame !== game || resolveActorSource(sourceUuid, { game: currentGame }) !== actor) {
            throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
          }
          if (!canOwn(actor, currentGame.user)) throw new CommandError("FORBIDDEN", localizeFoundry("VEMOBILE.Character.CommandGateway.YouNoLongerHavePermissionToControlThisActor", "You no longer have permission to control this actor."));
        } });
        templateUsage?.finish();
        assertSession(game, expectedSession, getConnectionGeneration);
        assertSystemIntegration(systemIntegration, game);
        // Native return values are tied to this exact command, including
        // integrations that do not publish createChatMessage on this client.
        const returnedId = returnedActionMessageId(output);
        const returnedMessage = returnedId ? uniqueMessages([...messageDocuments(game), ...(actionCapture?.messages ?? [])])
          .find(message => messageIdentifier(message) === returnedId) : null;
        if (returnedMessage) announceAccepted(returnedMessage, { returned: true });
        let rollResult = resultFromRollOutput(output, canRevealActionMessage) ?? resultFromNewMessage(game, existingMessageIds, actor, game.user.id, canRevealActionMessage);
        if (!actionItem && rollResult && output) {
          const message = uniqueMessages([...messageDocuments(game), ...(actionCapture?.messages ?? [])])
            .find(message => !existingMessageIds.has(messageIdentifier(message))
              && messages.acceptsAction(message, actor, null, name, payload, game.user.id));
          if (message) announceAccepted(message);
        }
        if (rollResult && diceWaiter) rollResult = await diceWaiter.finalize(rollResult, game, output);
        const response = { ok: true, command: name, actorId, ...(explicitSourceUuid ? { actorSourceUuid: sourceUuid } : {}) };
        Object.assign(response, actions.resultFields(name, output));
        let actionSession = announceActionSession(output) ?? announcedActionSession;
        if (actionItem && !actionSession && actionCapture) {
          await actionCapture.waitForChange(actionCapture.messages.length, 450);
          actionSession = announcedActionSession ?? announceActionSession(output);
        }
        if (actionSession) response.actionSession = actionSession;
        if (rollResult) response.rollResult = rollResult;
        assertSession(game, expectedSession, getConnectionGeneration);
        assertSystemIntegration(systemIntegration, game);
        return Object.freeze(response);
      } catch (error) {
        if (error instanceof CommandError) throw error;
        throw new CommandError("COMMAND_FAILED", error?.message ?? localizeFoundry("VEMOBILE.Character.CommandGateway.TheFoundryActionFailed", "The Foundry action failed."), { cause: error });
      } finally {
        templateUsage?.dispose();
        actionCapture?.dispose();
        diceWaiter?.dispose();
        inFlight.delete(fingerprint);
      }
    }
  });
}


function createDiceSoNiceWaiter(game, getHooks) {
  let active = false;
  try {
    active = Boolean(game?.modules?.get?.("dice-so-nice")?.active);
    if (active && game?.dice3d?.messageHookDisabled) active = false;
    if (active && typeof game?.dice3d?.isEnabled === "function" && !game.dice3d.isEnabled()) active = false;
  } catch {
    active = false;
  }
  const hooks = typeof getHooks === "function" ? getHooks() : null;
  if (!active || typeof hooks?.on !== "function") return null;

  const completed = new Set();
  let resolvePending = null;
  const onComplete = (messageId) => {
    const id = messageIdentifier(messageId);
    if (!id) return;
    completed.add(id);
    resolvePending?.(id);
    resolvePending = null;
  };
  const hookId = hooks.on("diceSoNiceRollComplete", onComplete);

  return {
    async finalize(result, currentGame, output) {
      const messageId = String(result?.messageId ?? "");
      if (!messageId) return result;
      if (!completed.has(messageId)) {
        await new Promise((resolve) => {
          let settled = false;
          let timerId = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (timerId !== null) clearTimeout(timerId);
            resolvePending = null;
            resolve();
          };
          resolvePending = (id) => {
            if (id === messageId) finish();
          };
          timerId = setTimeout(finish, 12000);
        });
      }
      const returned = resultFromRollOutput(output);
      const message = messageDocuments(currentGame).find((candidate) => messageIdentifier(candidate) === messageId);
      const refreshed = Array.from(message?.rolls ?? [])
        .map((roll) => rollResultRecord(roll, message))
        .find(Boolean);
      return refreshed ?? (returned?.messageId === messageId ? returned : result);
    },
    dispose() {
      hooks.off?.("diceSoNiceRollComplete", hookId);
      resolvePending = null;
    }
  };
}

function resultFromRollOutput(output, canReveal = canRevealMessage) {
  const rolls = Array.isArray(output) ? output : [];
  for (const roll of rolls) {
    const message = roll?.parent;
    if (!message || !canReveal(message)) continue;
    const result = rollResultRecord(roll, message);
    if (result) return result;
  }
  return null;
}

function resultFromNewMessage(game, existingIds, actor, userId, canReveal = canRevealMessage) {
  const messages = messageDocuments(game).filter((message) => {
    const id = messageIdentifier(message);
    if (!id || existingIds.has(id) || !canReveal(message)) return false;
    const source = message?._source ?? message;
    const authorId = message?.author?.id ?? message?.user?.id ?? source?.user;
    return speakerMatchesActor(message, actor) && (!authorId || authorId === userId);
  });
  for (const message of messages.reverse()) {
    for (const roll of Array.from(message?.rolls ?? [])) {
      const result = rollResultRecord(roll, message);
      if (result) return result;
    }
  }
  return null;
}

function rollResultRecord(roll, message) {
  const total = Number(roll?.total);
  if (!Number.isFinite(total)) return null;
  const formula = String(roll?.formula ?? roll?._formula ?? "").trim();
  const breakdown = rollBreakdown(roll);
  return Object.freeze({
    total,
    messageId: messageIdentifier(message),
    ...(formula ? { formula: formula.slice(0, 160) } : {}),
    ...(breakdown.length ? { breakdown: Object.freeze(breakdown) } : {})
  });
}

function rollBreakdown(roll) {
  let terms = [];
  try {
    terms = Array.from(roll?.terms ?? roll?._terms ?? roll?.dice ?? roll?._dice ?? []);
  } catch {
    terms = [];
  }
  const breakdown = [];
  for (const term of terms) {
    const formula = String(term?.formula ?? "").trim();
    const faces = Number(term?.faces);
    let results = [];
    try {
      results = Array.from(term?.results ?? term?._results ?? []);
    } catch {
      results = [];
    }
    if (faces > 0 && results.length) {
      for (const result of results) {
        if (result && typeof result === "object" && (result.active === false || result.discarded || result.rerolled)) continue;
        const value = Number(result && typeof result === "object" ? result.result : result);
        if (Number.isFinite(value)) breakdown.push({ kind: "die", label: `${Number(term?.number ?? term?._number) > 1 ? `${Number(term?.number ?? term?._number)}` : ""}d${faces}`, value });
      }
      continue;
    }
    if (faces > 0) {
      const value = Number(term?.total ?? term?._total);
      if (Number.isFinite(value)) breakdown.push({ kind: "die", label: `${Number(term?.number ?? term?._number) > 1 ? `${Number(term?.number ?? term?._number)}` : ""}d${faces}`, value });
      continue;
    }
    if (!/^[+-]?\d+(?:\.\d+)?$/u.test(formula)) continue;
    const value = Number(term?.total ?? formula);
    if (Number.isFinite(value)) breakdown.push({ kind: "modifier", label: `${value >= 0 ? "+" : ""}${value}` });
  }
  return breakdown.slice(0, 12);
}

function messageDocuments(game) {
  try {
    return Array.from(game?.messages ?? []);
  } catch {
    return [];
  }
}

function messageIdentifier(message) {
  if (typeof message === "string" || typeof message === "number") return String(message);
  return String(message?.id ?? message?._id ?? message?._source?._id ?? "");
}

function actionSessionFromNewMessages(game, existingIds, actor, item, output, captured = [], includeSourceUuid = false, targetIds = [], targetPreviews = [], messages) {
  const { originatingMessageId, referencesItem: messageReferencesItem } = messages;
  const created = uniqueMessages([...messageDocuments(game), ...captured]).filter((message) => {
    const id = messageIdentifier(message);
    return id && !existingIds.has(id) && (messages.canReveal ? messages.canReveal(message, game) : canRevealMessage(message))
      && (!messages.rootMatches || messages.rootMatches(message, actor, item));
  });
  const returnedRootId = returnedActionMessageId(output);
  const returnedRoot = returnedRootId
    ? created.find((message) => messageIdentifier(message) === returnedRootId)
    : null;
  if (!created.length && !returnedRoot) return null;

  const createdIds = new Set(created.map(messageIdentifier));
  const capturedIds = new Set(captured.map(messageIdentifier));
  const roots = created.filter((message) => {
    const origin = originatingMessageId(message);
    return !origin || !createdIds.has(origin);
  });
  const root = returnedRoot
    ?? roots.find((message) => speakerMatchesActor(message, actor) && messageReferencesItem(message, item.id))
    ?? created.find((message) => speakerMatchesActor(message, actor) && messageReferencesItem(message, item.id))
    ?? (actor?.isToken ? roots.find((message) => speakerMatchesActor(message, actor)) : null)
    ?? (actor?.isToken ? created.find((message) => speakerMatchesActor(message, actor)) : null)
    ?? roots.find((message) => messageReferencesItem(message, item.id))
    ?? created.find((message) => messageReferencesItem(message, item.id))
    ?? roots.find((message) => speakerMatchesActor(message, actor))
    ?? created.find((message) => speakerMatchesActor(message, actor))
    ?? roots.find((message) => messageAuthorId(message) === String(game?.user?.id ?? ""))
    ?? created.find((message) => messageAuthorId(message) === String(game?.user?.id ?? ""))
    ?? roots.find((message) => capturedIds.has(messageIdentifier(message)))
    ?? created.find((message) => capturedIds.has(messageIdentifier(message)))
    ?? (roots.length === 1 ? roots[0] : null)
    ?? (created.length === 1 ? created[0] : null)
    ?? null;
  if (!root) return null;

  const included = new Set([messageIdentifier(root)]);
  // A native item use can create separate activity cards without an
  // originatingMessage flag. Only include exact actor/item cards captured
  // during this command; unrelated contemporary chat remains excluded.
  for (const message of created) {
    if (capturedIds.has(messageIdentifier(message)) && speakerMatchesActor(message, actor) && messageReferencesItem(message, item.id)) included.add(messageIdentifier(message));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const message of created) {
      const id = messageIdentifier(message);
      if (included.has(id) || !included.has(originatingMessageId(message))) continue;
      included.add(id);
      changed = true;
    }
  }
  return Object.freeze({
    rootMessageId: messageIdentifier(root),
    messageIds: Object.freeze(created.map(messageIdentifier).filter((id) => included.has(id))),
    actorId: String(actor.id ?? ""),
    ...(includeSourceUuid || actor.isToken ? { actorSourceUuid: actorSourceUuid(actor) } : {}),
    itemId: String(item.id ?? ""),
    ...(targetIds.length ? { targetIds: Object.freeze([...new Set(targetIds)]) } : {}),
    ...(targetPreviews.length ? { targetPreviews: Object.freeze(targetPreviews) } : {}),
    label: String(item.name ?? root.title ?? localizeFoundry("VEMOBILE.Character.CommandGateway.ItemAction", "Item action")).slice(0, 160),
    img: String(item.img ?? "")
  });
}

function beginActionMessageCapture(hooks, existingIds, onMessage = () => {}) {
  const messages = [];
  const waiters = new Set();
  const onCreate = (message, _options, userId) => {
    const id = messageIdentifier(message);
    if (!id || existingIds.has(id) || messages.some((candidate) => messageIdentifier(candidate) === id)) return;
    messages.push(message);
    onMessage(message, userId);
    for (const wake of [...waiters]) wake();
  };
  const hookId = hooks?.on?.("createChatMessage", onCreate);
  return Object.freeze({
    get messages() {
      return [...messages];
    },
    waitForChange(previousCount, delay) {
      if (messages.length > previousCount) return Promise.resolve();
      return new Promise((resolve) => {
        let timeoutId;
        const finish = () => {
          clearTimeout(timeoutId);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        timeoutId = setTimeout(finish, delay);
      });
    },
    dispose() {
      if (hookId !== undefined && hookId !== null) hooks?.off?.("createChatMessage", hookId);
      for (const wake of [...waiters]) wake();
    }
  });
}

function uniqueMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    const id = messageIdentifier(message);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function returnedActionMessageId(output) {
  const references = [
    output?.message,
    output?.chatMessage,
    output?.document,
    output?.workflow?.chatCard,
    output?.workflow?.itemCardUuid,
    output?.itemCardUuid,
    output
  ];
  for (const reference of references) {
    const id = messageIdFromReference(reference);
    if (id) return id;
  }
  return "";
}

function messageIdFromReference(reference) {
  if (!reference) return "";
  if (typeof reference === "string") {
    const match = reference.match(/(?:^|\.)ChatMessage\.([^.]+)$/u);
    return match?.[1] ?? "";
  }
  const documentName = String(reference.documentName ?? reference.constructor?.metadata?.name ?? "");
  if (documentName && documentName !== "ChatMessage") return "";
  return messageIdentifier(reference);
}

function speakerActorId(message) {
  return String(message?.speaker?.actor ?? message?._source?.speaker?.actor ?? "");
}

function messageAuthorId(message) {
  return String(message?.author?.id ?? message?.user?.id ?? message?._source?.author ?? message?._source?.user ?? "");
}

function canRevealMessage(message) {
  return message?.visible !== false && message?.isContentVisible !== false;
}

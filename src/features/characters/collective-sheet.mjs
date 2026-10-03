import { icon, node } from "../../ui/dom.mjs";
import { bindDetailsDisclosure } from "../../ui/disclosure.mjs";

export function actorSheetTabs(type) {
  if (type === "group") return [["overview", "overview", "Members"], ["inventory", "inventory", "Supplies"], ["biography", "biography", "About"]];
  if (type === "vehicle") return [["overview", "overview", "Status"], ["features", "features", "Actions"], ["inventory", "inventory", "Cargo"], ["biography", "biography", "Details"]];
  return null;
}

export function actorOriginBack(state, commands, scope) {
  const origin = state.characterNavigation?.at(-1);
  if (!origin) return null;
  return node("button", { className: "ve-sheet-back ve-actor-origin-back", attrs: { type: "button" },
    on: { click: () => commands.returnToActorOrigin() }, children: [icon("fa-chevron-left"), node("span", {
      text: translate(commands, "BackTo", `Back to ${origin.name}`, { name: origin.name })
    })] }, scope);
}

export function collectiveHeaderContent(actor, { portraitButton, characterName, trigger, commands, scope, status }) {
  const data = actor.collective;
  return [node("div", { className: "ve-collective-identity", children: [
    portraitButton, node("div", { className: "ve-collective-identity-copy", children: [characterName, node("p", {
      text: actor.type === "group" ? translate(commands, "Group", "Group") : data.variantLabel
    })] }), trigger
  ] }), actor.capabilities?.nativeActorEditor ? node("button", { className: "ve-collective-native-editor", attrs: { type: "button" },
    on: { click: async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await commands.openNativeActorEditor({ actorSourceUuid: actor.sourceUuid }); }
      catch (error) { if (!scope.disposed) { status.classList.add("is-error"); status.textContent = error.message; } }
      finally { if (!scope.disposed) button.disabled = false; }
    } }, children: [icon("fa-pen-to-square"), node("span", { text: translate(commands, "NativeEditor", "Native configuration & edit") })]
  }, scope) : null];
}

/** Every supplied record is plain. Shared collection/roll surfaces are passed
 * by this feature's parent presenter, without reaching into another feature. */
export function renderCollectivePanel(actor, page, context, shared) {
  const { commands, scope } = context;
  const data = actor.collective;
  if (page === "inventory") return shared.inventory();
  if (page === "features" && actor.type === "vehicle") return vehicleActions(actor, context, shared);
  if (page === "biography") return node("div", { className: "ve-sheet-stack ve-collective-details", children: [
    actor.type === "vehicle" ? vehicleDetails(actor, context) : actor.biography.summary ? card(translate(commands, "Summary", "Summary"),
      [node("p", { className: "ve-collective-prose", text: actor.biography.summary })]) : null,
    shared.biography()
  ] });
  if (actor.type === "group") {
    const summary = [
      data.travel ? fact(translate(commands, "TravelPace", "Travel pace"), data.travel.pace) : null,
      data.averageLevel === null ? null : fact(translate(commands, "AverageLevel", "Average PC level"), data.averageLevel),
      data.pooledExperience === null ? null : fact(translate(commands, "PooledXP", "Pooled XP"), data.pooledExperience)
    ].filter(Boolean);
    return node("div", { className: "ve-sheet-stack ve-group-members", children: [
      summary.length ? card(translate(commands, "Group", "Group"), [node("dl", { className: "ve-collective-facts", children: summary }),
        ...travelFacts(data.travel?.rows, commands)]) : null,
      data.aggregateRestricted ? node("p", { className: "ve-sheet-empty", text: translate(commands, "RestrictedAggregate", "Group aggregates are unavailable while a member is inaccessible.") }) : null,
      data.primaryVehicle ? referenceList(translate(commands, "PrimaryVehicle", "Primary vehicle"), [data.primaryVehicle], actor, context) : null,
      referenceList(translate(commands, "Members", "Members"), data.members, actor, context, true)
    ] });
  }
  const hp = data.hp;
  const status = [
    hp ? fact(translate(commands, "HitPoints", "Hit points"), `${hp.value ?? "—"} / ${hp.max ?? "—"}${hp.temp ? ` (+${hp.temp})` : ""}`) : null,
    data.ac === null ? null : fact(translate(commands, "ArmorClass", "Armor class"), data.ac),
    hp?.damageThreshold === null || hp?.damageThreshold === undefined ? null : fact(translate(commands, "DamageThreshold", "Damage threshold"), hp.damageThreshold),
    hp?.mishapThreshold === null || hp?.mishapThreshold === undefined ? null : fact(translate(commands, "MishapThreshold", "Mishap threshold"), hp.mishapThreshold),
    data.initiative === null ? null : fact(translate(commands, "Initiative", "Initiative"), modifier(data.initiative)),
    data.quality === null ? null : fact(translate(commands, "Quality", "Quality"), modifier(data.quality)),
    data.actions ? fact(translate(commands, "ActionsRemaining", "Actions remaining"), `${data.actions.value ?? "—"} / ${data.actions.max}`) : null
  ].filter(Boolean);
  return node("div", { className: "ve-sheet-stack ve-vehicle-status", children: [
    node("div", { className: "ve-collective-grid", children: [
      status.length ? card(translate(commands, "Condition", "Condition"), [node("dl", { className: "ve-collective-facts", children: status }),
        hp && actor.capabilities?.editHitPoints ? node("button", { className: "ve-collective-native-editor", attrs: { type: "button" },
          on: { click: () => commands.openHitPointEditor("hp") }, children: [icon("fa-heart"), node("span", { text: translate(commands, "EditHitPoints", "Edit hit points") })] }, scope) : null]) : null,
      data.movement.length || data.travelSpeed.length || data.travelPace.length ? card(translate(commands, "MovementTravel", "Movement & travel"), [
        ...travelFacts(data.movement, commands), ...travelFacts(data.travelSpeed, commands, "TravelSpeed", "Travel speed"),
        ...travelFacts(data.travelPace, commands, "TravelPace", "Travel pace")
      ]) : null
    ] }),
    shared.traits(),
    data.showAbilities ? shared.abilities() : null,
    disclosure("vehicle-effects", translate(commands, "EffectsConditions", "Effects & conditions"), shared.effects, context)
  ] });
}

function vehicleActions(actor, context, shared) {
  const { commands, scope } = context;
  const components = actor.collective.components;
  const featuresById = new Map(actor.features.map(item => [item.id, item]));
  return node("div", { className: "ve-sheet-stack ve-vehicle-actions", children: [
    components.length ? node("div", { className: "ve-collective-grid", children: components.map(component => {
      const item = featuresById.get(component.itemId);
      if (!item) return null;
      const stats = [
        component.ac === null ? null : fact(translate(commands, "ArmorClass", "Armor class"), component.ac),
        component.hp ? fact(translate(commands, "HitPoints", "Hit points"), `${component.hp.value ?? "—"} / ${component.hp.max ?? "—"}`) : null,
        component.hp?.threshold === null || component.hp?.threshold === undefined ? null : fact(translate(commands, "DamageThreshold", "Damage threshold"), component.hp.threshold),
        component.speed ? fact(translate(commands, "Speed", "Speed"), `${component.speed.value} ${component.speed.units}`) : null,
        component.crewCapacity === null ? null : fact(translate(commands, "CrewCapacity", "Crew capacity"), component.crewCapacity),
        component.cover === null ? null : fact(translate(commands, "Cover", "Cover"), coverLabel(component.cover, commands))
      ].filter(Boolean);
      return node("section", { className: "ve-sheet-card ve-collective-card ve-vehicle-component", children: [
        shared.item(item), stats.length ? node("dl", { className: "ve-collective-facts", children: stats }) : null,
        component.hp?.conditions ? node("p", { text: component.hp.conditions }) : null,
        component.speed?.conditions ? node("p", { text: component.speed.conditions }) : null,
        component.crew.length ? referenceList(translate(commands, "AssignedCrew", "Assigned crew"), component.crew, actor, context) : null
      ] });
    }) }) : null,
    shared.features(new Set(components.map(component => component.itemId)))
  ] });
}

function vehicleDetails(actor, context) {
  const { commands } = context;
  const data = actor.collective;
  const dimensions = [fact(translate(commands, "Size", "Size"), data.size), ...data.dimensions.map(row => fact(translate(commands, row.key,
    ({ keel: "Keel", beam: "Beam", weight: "Weight", price: "Price" })[row.key]), row.value)),
    data.capacity.cargo === null ? null : fact(translate(commands, "CargoCapacity", "Cargo capacity"), data.capacity.cargo),
    data.crewCapacity === null ? null : fact(translate(commands, "CrewCapacity", "Crew capacity"), data.crewCapacity),
    data.passengerCapacity === null ? null : fact(translate(commands, "PassengerCapacity", "Passenger capacity"), data.passengerCapacity)
  ].filter(Boolean);
  return node("div", { className: "ve-sheet-stack", children: [
    card(translate(commands, "DimensionsCapacity", "Dimensions & capacity"), [node("dl", { className: "ve-collective-facts", children: dimensions }),
      data.legacyDimensions ? node("p", { text: data.legacyDimensions }) : null,
      data.capacity.legacyCreatures ? node("p", { text: data.capacity.legacyCreatures }) : null]),
    data.crew.length ? referenceList(translate(commands, "Crew", "Crew"), data.crew, actor, context) : null,
    data.passengers.length ? referenceList(translate(commands, "Passengers", "Passengers"), data.passengers, actor, context) : null,
    data.draft.length ? referenceList(translate(commands, "DraftAnimals", "Draft animals"), data.draft, actor, context) : null,
    ...[["LegacyCrew", "Additional crew", data.legacyCrew], ["LegacyPassengers", "Additional passengers", data.legacyPassengers]]
      .filter(([, , rows]) => rows.length).map(([key, title, rows]) => card(translate(commands, key, title), rows.map(row => node("p", { text: `${row.name}${row.quantity === null ? "" : ` ×${row.quantity}`}` }))))
  ] });
}

function referenceList(title, records, actor, context, vitals = false) {
  const { commands, scope, status } = context;
  return card(title, [node("div", { className: "ve-collective-roster", children: records.length ? records.map(member => {
    const action = node("button", { className: "ve-collective-member-open", attrs: { type: "button", disabled: !member.canNavigate },
      on: { click: () => {
        try { commands.openReferencedActor({ originSourceUuid: actor.sourceUuid, targetSourceUuid: member.sourceUuid }); }
        catch (error) { if (!scope.disposed) { status.classList.add("is-error"); status.textContent = error.message; } }
      } }, children: [member.available ? node("img", { attrs: { src: member.img, alt: "", loading: "lazy", decoding: "async" } }) : icon("fa-lock"),
        node("span", { children: [node("strong", { text: member.available ? member.name : translate(commands, "UnavailableMember", "Unavailable member") }),
          member.quantity > 1 ? node("small", { text: `×${member.quantity}` }) : null] }), member.canNavigate ? icon("fa-chevron-right") : null]
    }, scope);
    const facts = vitals && member.available ? [
      member.hp ? fact(translate(commands, "HitPoints", "Hit points"), `${member.hp.value} / ${member.hp.max ?? "—"}${member.hp.temp ? ` (+${member.hp.temp})` : ""}`) : null,
      member.ac === null ? null : fact(translate(commands, "ArmorClass", "Armor class"), member.ac),
      member.level === null ? null : fact(translate(commands, "Level", "Level"), member.level),
      member.hitDice?.value === null || member.hitDice?.value === undefined ? null : fact(translate(commands, "HitDice", "Hit dice"), `${member.hitDice.value} / ${member.hitDice.max ?? "—"}`),
      ...(member.speed ?? []).filter(row => row.value > 0).map(row => fact(row.label, row.text)),
      ...(member.skills ?? []).map(skill => fact(skill.label, `${skill.total === null ? "—" : modifier(skill.total)} (${skill.passive ?? "—"})`))
    ].filter(Boolean) : [];
    return node("article", { className: "ve-collective-member", children: [action,
      facts.length ? node("dl", { className: "ve-collective-facts", children: facts }) : null,
      member.assigned > 0 ? node("p", { text: translate(commands, "CrewAssignedCount", `${member.assigned} assigned to stations`, { count: member.assigned }) }) : null
    ] });
  }) : [node("p", { className: "ve-sheet-empty", text: translate(commands, "NoMembers", "No members recorded.") })] })]);
}

function disclosure(key, title, render, context) {
  const { commands, scope, state } = context;
  const initiallyOpen = state.characterOpenSections?.includes(key);
  const summary = node("summary", { text: title });
  const details = node("details", { className: "ve-sheet-card ve-collective-disclosure", attrs: { open: initiallyOpen }, children: [summary] });
  let childScope = null;
  const fill = open => {
    childScope?.dispose(); childScope = null;
    details.querySelector(":scope > div")?.remove();
    if (!open) return;
    childScope = scope.child(key);
    details.append(node("div", { children: [render(childScope)] }));
  };
  bindDetailsDisclosure(details, summary, open => { fill(open); commands.setCharacterSectionExpanded(key, open); }, scope);
  fill(initiallyOpen);
  return details;
}
function travelFacts(rows = [], commands, key, title) {
  return rows.length ? [node("dl", { className: "ve-collective-facts", children: rows.map(row => fact(
    `${key ? `${translate(commands, key, title)} · ` : ""}${row.label}`, `${row.text}${row.hover ? ` (${translate(commands, "Hover", "Hover")})` : ""}`)) })] : [];
}
function card(title, children) { return node("section", { className: "ve-sheet-card ve-collective-card", children: [node("h3", { text: title }), ...children] }); }
function fact(label, value) { return node("div", { children: [node("dt", { text: label }), node("dd", { text: value ?? "—" })] }); }
function modifier(value) { return value >= 0 ? `+${value}` : String(value); }
function coverLabel(value, commands) { return translate(commands, ({0: "CoverNone", 0.5: "CoverHalf", 0.75: "CoverThreeQuarters", 1: "CoverTotal"})[value] ?? "Cover", ({0: "None", 0.5: "Half", 0.75: "Three-quarters", 1: "Total"})[value] ?? String(value)); }
function translate(commands, key, fallback, data) { return commands.localize?.(`VEMOBILE.Collective.${key}`, fallback, data) ?? fallback; }

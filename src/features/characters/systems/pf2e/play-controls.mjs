import { ACTOR_COMMANDS as C } from "../../../../kernel/command-names.mjs";
import { node, icon } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";
import { collectionGroup } from "./collection-controls.mjs";

const t = (commands,key,fallback) => localizedText(commands.localize,`VEMOBILE.PF2E.Play.${key}`,fallback);
const button = (label,run,scope,disabled=false) => node("button",{className:"ve-pf2e-action-button",text:label,attrs:{type:"button",disabled},on:{click:event=>{event.preventDefault();run(event.currentTarget);}}},scope);

export function ruleOptions(actor,commands,scope,run) {
  const pf2e=actor.pf2e ?? {};
  const linked=new Set([
    ...(pf2e.features ?? []), ...(pf2e.inventory ?? []), ...(pf2e.details?.effects ?? []),
    ...(pf2e.featGroups ?? []).flatMap(group=>group.entries ?? []),
    ...Object.values(pf2e.spellBrowsing ?? {}).flat(),
    ...(pf2e.spellcasting ?? []).flatMap(entry=>(entry.options ?? []).map(spell=>({id:spell.spellId})))
  ].map(item=>item.id));
  const toggles=(pf2e.play?.toggles ?? []).filter(toggle=>!linked.has(toggle.itemId));
  if (!toggles.length) return null;
  return collectionGroup({key:"actions:options",label:t(commands,"Options","Options"),glyph:"fa-sliders",open:false,className:"ve-pf2e-rule-options",children:toggleRows(toggles,actor,commands,scope,run)});
}

export function itemRuleOptions(itemId,actor,commands,scope,run) {
  const toggles=(actor.pf2e?.play?.toggles ?? []).filter(toggle=>toggle.itemId===itemId);
  return toggles.length ? node("div",{className:"ve-pf2e-item-rule-options",children:toggleRows(toggles,actor,commands,scope,run)}) : null;
}

function toggleRows(toggles,actor,commands,scope,run) {
  return toggles.map(toggle=>{
    const selected=toggle.suboptions.find(option=>option.selected)?.value ?? null;
    const payload={operation:"toggle",itemId:toggle.itemId,domain:toggle.domain,option:toggle.option,originalChecked:toggle.checked,originalSelection:selected};
    const input=node("input",{attrs:{type:"checkbox",checked:toggle.checked,disabled:!actor.capabilities?.playControls || !toggle.enabled || toggle.alwaysActive,"aria-label":toggle.label}});
    input.dataset.pf2eFocusKey=`rule:${toggle.itemId}:${toggle.domain}:${toggle.option}:checked`;
    const select=toggle.suboptions.length ? node("select",{attrs:{"aria-label":toggle.label,disabled:!actor.capabilities?.playControls || !toggle.enabled || toggle.suboptions.length===1},children:toggle.suboptions.map(option=>node("option",{text:option.label,attrs:{value:option.value,selected:option.selected}}))}):null;
    if(select)select.dataset.pf2eFocusKey=`rule:${toggle.itemId}:${toggle.domain}:${toggle.option}:selection`;
    let pending=false;
    const change=async values=>{
      if(pending||scope.disposed)return;
      pending=true;
      const controls=[input,select].filter(Boolean),disabled=controls.map(control=>control.disabled);
      controls.forEach(control=>{control.disabled=true;});
      try { await run(C.EDIT_PF2E_PLAY,{...payload,...values}); }
      finally { pending=false;if(!scope.disposed)controls.forEach((control,index)=>{control.disabled=disabled[index];}); }
    };
    scope.listen(input,"change",()=>change({checked:input.checked,selection:selected}));
    if(select)scope.listen(select,"change",()=>change({checked:toggle.checked,selection:select.value}));
    return node("div",{className:"ve-pf2e-rule-option",children:[node("label",{children:[input,node("span",{text:toggle.label})]}),select]});
  });
}

export function explorationControl(feature,actor,commands,scope,run) {
  if(!feature.traitSlugs?.includes("exploration"))return null;
  const active=actor.pf2e.play?.exploration?.includes(feature.id) ?? false;
  const control=button(t(commands,active?"ActiveExploration":"StartExploration",active?"Active exploration":"Start exploring"),()=>run(C.EDIT_PF2E_PLAY,{operation:"exploration",itemId:feature.id,active:!active,originalActive:active}),scope,!actor.capabilities?.playControls);
  control.setAttribute("aria-pressed",String(active));
  return control;
}

export function ammunitionControls(strike,actor,commands,scope,run) {
  const ammo=strike.ammunition;
  if(!ammo)return null;
  const select=node("select",{attrs:{"aria-label":t(commands,"Ammunition","Ammunition"),disabled:!actor.capabilities?.playControls || !ammo.options.some(option=>option.quantity>0)},children:[
    ...(!ammo.reload || !ammo.options.length?[node("option",{text:t(commands,"NoAmmo","No ammunition"),attrs:{value:""}})]:[]),
    ...ammo.options.map(option=>node("option",{text:`${option.name} (${option.quantity})`,attrs:{value:option.id,selected:option.id===ammo.selectedId,disabled:option.quantity<=0}}))
  ]});
  select.value=ammo.selectedId ?? "";
  scope.listen(select,"change",()=>run(C.EDIT_PF2E_PLAY,{operation:"ammunition",itemId:strike.itemId,slug:strike.slug,ammoId:select.value||null,originalSelectedId:ammo.selectedId}));
  return node("label",{className:"ve-pf2e-ammunition-controls",children:[node("span",{text:t(commands,ammo.reload?"LoadedAmmo":"Ammunition",ammo.reload?"Loaded ammunition":"Ammunition")}),select]});
}

export function elementalBlasts(actor,commands,scope,run) {
  const blasts=actor.pf2e?.play?.blasts ?? [];
  if(!blasts.length)return null;
  return collectionGroup({key:"actions:blasts",label:t(commands,"ElementalBlasts","Elemental Blasts"),glyph:"fa-fire",open:true,className:"ve-pf2e-elemental-blasts",dataset:{pf2eActionMode:"encounter"},children:blasts.map(blast=>{
    const selected=blast.damageTypes.find(type=>type.selected)?.value;
    const base={operation:"blast",itemId:blast.itemId,element:blast.element,damageType:selected};
    const execute=extra=>run(C.EDIT_PF2E_PLAY,{...base,...extra},true);
    const damage=blast.damageTypes.length>1?node("select",{attrs:{"aria-label":t(commands,"DamageType","Damage type"),disabled:!actor.capabilities?.playControls},children:blast.damageTypes.map(type=>node("option",{text:type.label,attrs:{value:type.value,selected:type.selected}}))}):null;
    if(damage)scope.listen(damage,"change",()=>execute({mode:"damage-type",damageType:damage.value,originalDamageType:selected}));
    return node("article",{className:"ve-pf2e-blast-card",dataset:{pf2eSearchText:blast.label},children:[
      node("header",{children:[node("img",{attrs:{src:blast.img,alt:""}}),node("strong",{text:blast.label}),node("small",{text:blast.range}),damage]}),
      !blast.ready?button(t(commands,"ChannelElements","Channel Elements"),()=>execute({mode:"channel"}),scope,!actor.capabilities?.playControls):
      node("div",{className:"ve-pf2e-blast-usages",children:[true,false].map(melee=>node("section",{children:[
        node("div",{className:"ve-pf2e-blast-usage-label",children:[node("strong",{text:t(commands,melee?"Melee":"Ranged",melee?"Melee":"Ranged")}),node("span",{className:"ve-pf2e-native-cost",text:String(blast.actionCost)})]}),
        node("div",{className:"ve-pf2e-blast-buttons",children:[...blast.maps[melee?"melee":"ranged"].map((label,index)=>{
          const control=button(label,()=>execute({mode:"attack",melee,mapIncreases:index}),scope,!actor.capabilities?.playControls);
          control.setAttribute("aria-label",label);
          const parts=label.match(/^([+\-−]?\d+)\s*(.*)$/u);
          if(parts)control.replaceChildren(node("strong",{text:parts[1]}),...(parts[2]?[node("small",{text:parts[2].replace(/^\((.*)\)$/u,"$1")})]:[]));
          return control;
        }),
          button(t(commands,"Damage","Damage"),()=>execute({mode:"damage",melee}),scope,!actor.capabilities?.playControls),
          button(t(commands,"Critical","Critical"),()=>execute({mode:"critical",melee}),scope,!actor.capabilities?.playControls)
        ]})
      ]}))})
    ]});
  })});
}

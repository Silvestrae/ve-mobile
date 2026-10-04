# Changelog

## Unreleased

## 1.0.2 — 2026-10-04

- Fixed Chat dice-tray taps so they no longer open the mobile keyboard unless
  the composer was intentionally focused.
- Fixed dice-tray touch events activating navigation controls underneath them.
- Prevented native Foundry Settings from automatically opening the mobile
  keyboard when opened through VE Mobile.
- Added GM combat controls for Previous Turn, Start/End Combat and Next Turn.
- Made Chat and Damage Log tabs share the full Chat panel width evenly.
- Improved short Character tabs so the header can always reach its fully
  compact state.

## 1.0.1 — 2026-10-04

- Fixed Tablet Split navigation overlap that could block or mis-trigger Character.
- Improved narrow-screen wrapping in Settings, Combat, Spells, Journals and Scene selection.
- Corrected translated labels and missing VE-owned strings across all six supported languages.
- Separated saving-throw terminology from Save actions and improved Character metadata,
  Biography labels, portrait titles and Journal controls.
- Refined long labels in German, Spanish, French and Italian while preserving Character
  performance, navigation and gameplay behaviour.

## 1.0.0 — 2026-10-04

Initial v1.0.0 of VE Mobile, a browser-native phone and tablet interface for
authenticated Foundry Virtual Tabletop sessions.

### Layouts and Actor sheets

- Death-save counters sit above the HP controls within the HP panel's width in
  expanded and compact Character headers, with readable dots and an accent-coloured d20
  roll button centered over the subdued portrait. Final results persist until
  HP recovery, with no reserved death-save space after recovery.
- Phone, Tablet Split, and Tablet Full layouts, with light/dark themes, responsive
  navigation, and persistent Character headers/navigation with independent
  content-pane scroll positions for each subtab.
- Session-only scroll positions and disclosure choices for each exact Actor
  source and Character subtab, with the first meaningful group initially open.
- Expanded Character headers that contract on scroll in Phone and
  Tablet Split to smaller portraits, inline level/proficiency, a shared
  HP/temporary HP/Inspiration row and compact stats above the stable subtab bar.
  Tablet Full and reduced motion keep the original expanded layout.
- Equal-width Character quick-stat columns, with alternate movement names in
  the Speed label and just the movement icon, value and units beneath it.
- Dedicated D&D5e Character, NPC, Group, and Vehicle sheets, folder-based Actor
  selection, portrait viewing, class accents, and configurable header artwork.
- Favorites, inventory and containers, spells, features, biography, currency,
  supported resources, HP, temporary HP, conditions, effects, and spell slots.
- Native checks, saves, initiative, death saves, item/spell activities, hit dice,
  and rests, with current ownership checks and protection against repeated taps.
- Native Group/Vehicle configuration and editing for broader system operations.

### Scene and gameplay

- Live Foundry Scene panning and pinch zoom, token selection and targeting,
  token controls, touch drag movement, and an eight-direction movement joystick.
- A collapsible combat carousel whose compact view follows the Scene pane's
  left safe edge in Phone, Tablet Full, and either Tablet Split orientation.
- Native movement respects permissions, pause rules, walls, terrain, and grids.
- Contextual Actor-token placement, measured templates, and supported summons,
  with explicit confirmation and cancellation controls.
- Character Quickbar or Foundry Hotbar with ten slots per page, five pages,
  collapse controls, contextual assignment, and native macro editing.
- Optional compact native activity summaries with permitted roll and target
  results, plus accessible system dialogs and transient forms.

### Chat, journals, and combat

- Foundry's native chat, cards, composer, and supported module input controls,
  with mobile scrolling and keyboard-aware Phone/Tablet layouts.
- Permission-aware journal folders, rich pages, heading navigation, touch image
  viewing, and native editing where permitted.
- Combat turn order and role-appropriate controls, native End Turn, and an
  optional Scene turn carousel.

### Mobile operation

- Normal, Balanced, Strong, and Maximum graphics profiles; Scene memory warnings,
  preflight guidance, optional escalation, and no-Canvas operation.
- GM-authorized image optimization that preserves original files and Scene
  paths, plus mobile animated-effect and 3D-dice safety controls.
- Authority-aware Force Client Settings integration, temporary-setting
  restoration, and explicit recovery when restoration needs attention.
- Loading checkpoints, connection status, reconnect/resync, graphics recovery,
  and a browser-supported Keep Screen Awake option.
- Contextual Controls & Gestures help, accessible settings descriptions, and
  an experimental opt-in workflow for supported native module overlays.
- Responsive Character navigation, with contextual item actions available
  when their menus are opened.

### Languages and compatibility

- US English, Australian English, Spanish, German, French, and Italian for
  VE-owned controls, guides, settings, recovery messages, and accessible labels.
- Game content and other packages retain their own translation providers.
- Verified target: Foundry 13.351 with D&D5e 5.3.3. Declared minimums remain
  Foundry 13 and D&D5e 5.3.2; these do not claim testing of every version.
- Public README, installation instructions, bug/feature issue templates, and
  MIT license. Hardware and module combinations vary; community reports welcome.

# Changelog

## 1.1.0 — 2026-10-31

### Pathfinder Second Edition compatibility

Version 1.1.0 introduces PF2e character support on **Foundry v14+**, targeting
**PF2e 8.6.1**. This first PF2e release is a **community test build**. Constructive
reports should explain the steps taken, expected outcome, and actual result;
see the [PF2e community notice](README.md#pathfinder-second-edition).

**What you can do**

- Play existing characters using a dedicated mobile sheet, with class-themed
  artwork and colours, statistics, saves, skills, feats, and character details.
- Roll native attacks, checks, saves, initiative, and damage; use available
  equipment actions, ammunition, Elemental Blasts, and item rule options.
- Manage HP, XP, Hero/Focus Points, supported class resources, conditions,
  persistent damage, recovery, and overnight rests.
- Manage inventory, currency, Bulk, containers, carry state, investment, and
  supported item quantities, uses, and charges.
- Prepare and cast spells through supported native entries, including exact
  prepared slots, spontaneous/flexible/innate casting, Focus, rituals, and
  scroll/wand activations, with spell artwork in preparation and management.
- Read and edit biography sections, use character shortcuts, and retain list
  expansion and scroll state while navigating the sheet.

**Current limits**

- Foundry v13 and non-character actor types are unsupported for PF2e; NPCs,
  familiars, companions, and other specialist sheets are outside this release.
- Character creation/advancement, crafting/formula management, Pathfinder Society
  administration, and staff preparation/charges do not have complete mobile workflows.
- Specialist class, Mythic, and third-party mechanics need further gameplay
  testing. Native ritual casting does not automate the entire ritual procedure,
  and posting an item to chat does not automatically spend actions.

### Dungeons & Dragons Fifth Edition fixes

- Correct saving throw badges to display the full saving throw bonus, including
  applicable proficiency and other system modifiers.
- Show full ability-check and skill bonuses, including proficiency and other
  applicable modifiers, while retaining the base ability modifier separately.

### Shared improvements

- Reduce unnecessary snapshot processing and build PF2e spell views as needed to
  improve mobile responsiveness.
- Add custom colour themes with matching light/dark surfaces and readable controls.
- Improve journal wrapping and add remembered pinch-to-resize text; tap character
  artwork to open a full-screen image viewer.
- Improve token artwork sizing in movement and combat controls, mobile navigation,
  and theme consistency across sheets, chat, and dialogs.
- Add unread chat badges, permission-aware double-tap Scene pause controls, and
  encounter indicators that respect reduced motion.
- Give GM combat controls a solid panel, with native Roll All and Roll NPCs
  initiative buttons before an encounter starts.

## 1.0.7 — 2026-10-25

- Restore the mobile Place/Cancel template controls for D&D5e 6 on Foundry v14.
- Keep action summaries and result popups out of the way until template
  placement finishes on both supported Foundry versions.

## 1.0.6 — 2026-10-25

- Replace the exhaustion toggle with compact, right-aligned minus, level and plus
  controls, allowing exhaustion to be reduced to zero as well as increased.
- Show spell attack and save DC beside the Spellcasting heading. Multiclass
  casters can choose a class without changing their Actor's casting ability.
  The selector starts on the named primary class instead of “Default”.
- Speed up reconnects by keeping unchanged Actors and Scenes intact, including
  legacy records with generated IDs and native token overrides. Avoid repeated
  preparation that could double character level and proficiency.
- Fix the doubled DNA icon used for unrecognized species/backgrounds in the header.
- Match Foundry's average one-way latency in the tab bar and Settings.
- Restore translucent joystick and D-pad surfaces, including press feedback,
  and give the hotbar/quickbar backing the same translucency without fading icons.
- Restore older Desktop theme snapshots when newer Foundry versions add UI
  defaults, while preserving all captured preference values.

## 1.0.5 — 2026-10-19

- Choose Scene levels on Foundry v14 from an expandable list beneath each
  Scene. More compact Scene rows and a bordered level button keep the list
  easier to use on a phone. Scenes without levels hide the button.
- Fix the jumbled Scene three-dot menu on Foundry v14, with readable labels,
  icons and scrollable actions. Actions added by other modules remain available.
- Choose joystick or D-pad movement in Scene & Controls. The joystick now
  requires a touch on its centre followed by a deliberate swipe, preventing
  accidental movement when touching its outer edge.
- Add a compact D-pad around the token portrait, with one step per tap and
  a brief glow on the pressed direction. It takes up the same space as the
  joystick and keeps the portrait still.
- Match both movement controls to the Scene grid: eight directions on square
  and gridless maps, or six directions and a matching shape on hex maps.
  Fix hex movement when tokens start between grid positions.
- Add **Return to Scene after actions** for Phone and full-screen Tablet.
  Choose **Always**, **During combat only**, or **Off**. After using an item,
  spell or ability, return to the map to follow the action. Tablet Split
  keeps both panes visible.
- Keep enabled action summaries above the map after automatic return,
  including results that arrive later. Dismissed summaries stay dismissed.
- Fix the blank Scene after viewing some NPC or multiclass sheets, including
  in Light mode.
- Improve handling of Scene and level changes during movement or token
  placement, and restore clear messages when movement is blocked or paused.
- Translate the new settings into all six supported languages. Foundry v13
  and D&D5e 5.3 support continue alongside Foundry v14 and D&D5e 6.x.

## 1.0.4 — 2026-10-19

- Declare Foundry 14.369 and D&D5e 6.0.6 as verified in the module manifest.
  Keep the Foundry 13 and D&D5e 5.3.2 minimums and existing v13 support.

## 1.0.3 — 2026-10-19

- Keep v14's renamed Chat privacy selector horizontal on phones and tablets,
  while retaining the earlier selector used by supported Foundry versions.
- Keep Chat font submenus open for touch selection, preserve native inline
  formatting focus, and fit editor prompts above the software keyboard.
- Prevent disabled module overlays from retaining native-window admission or
  exposing children, including late mounts and detached YouTube players.
- Remove Dice So Nice's temporary roll canvas from the persistent overlay
  catalogue while preserving native dice presentation.
- Make SmallTime's persistent clock obey Module Overlays visibility, including
  disabled overlays rendered after mobile startup.
- Keep Foundry v14's Chat typing area visible below the formatting toolbar on
  phones, with scrollable formatting controls and native editor focus support.
- Keep native rich-text formatting dropdowns and their action dialogs accessible
  above the mobile interface.
- Support D&D5e 6 chat message references, compact roll markup, native attack
  targets, and sense labels while retaining D&D5e 5.3 / Foundry v13 behavior.

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

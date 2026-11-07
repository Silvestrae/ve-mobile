# <img src="Icon.png" alt="VE Mobile logo" height="40"> VE Mobile

[![Latest release](https://img.shields.io/github/v/release/Silvestrae/ve-mobile?label=Release)](https://github.com/Silvestrae/ve-mobile/releases/latest)
![Foundry VTT 13 and 14](https://img.shields.io/badge/Foundry_VTT-13_%26_14-orange)
![D&D5e](https://img.shields.io/badge/System-D%26D5e-red)
![Pathfinder Second Edition](https://img.shields.io/badge/System-PF2e-5c6840)
![Phone and Tablet](https://img.shields.io/badge/Phone_%26_Tablet-supported-blue)
[![MIT License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/Silvestrae/ve-mobile/total?label=Downloads&color=blue)](https://github.com/Silvestrae/ve-mobile/releases)
[![Ko-fi: Silvestrae](https://img.shields.io/badge/Ko--fi-Silvestrae-29abe0?logo=kofi&logoColor=white)](https://ko-fi.com/silvestrae)

**Your Foundry game, designed for touch.**

VE Mobile gives **D&D5e** and **Pathfinder Second Edition** a phone and tablet interface. Open your usual Foundry world in a browser and sign in. You can roll, cast spells, manage gear, read journals, follow chat and move tokens. Rolls and actions still go through your game system.

<p align="center">
  <img src="docs/screenshots/tablet-orna-hex-split.jpg" alt="Orna in Tablet Split, with her D&amp;D5e sheet beside the live hex-grid map" width="960">
</p>

Orna in Tablet Split with her D&D5e sheet beside the hex map. [Jump to the PF2e phone screenshots](#pf2e-phone-screenshots).

## Contents

- [Compatibility](#compatibility)
- [Devices and support](#devices-and-support)
- [Install and start playing](#install-and-start-playing)
- [Install as an app (PWA)](#install-as-an-app-pwa)
- [Phone and tablet layouts](#phone-and-tablet-layouts)
- [Dungeons & Dragons Fifth Edition](#dungeons--dragons-fifth-edition)
- [Pathfinder Second Edition](#pathfinder-second-edition)
- [Controls and shortcuts](#controls-and-shortcuts)
- [Scene and token movement](#scene-and-token-movement)
- [Chat, journals, and combat](#chat-journals-and-combat)
- [Appearance and performance](#appearance-and-performance)
- [Localisation](#localisation)
- [Troubleshooting](#troubleshooting)
- [Feedback and support](#feedback-and-support)
- [License and credits](#license-and-credits)

## Compatibility

| Game system | Minimum requirements |
| --- | --- |
| **D&D5e** | Foundry 13 and D&D5e 5.3.2 |
| **PF2e** | Foundry 14 and PF2e 8.6.1 |

**PF2e requires Foundry v14+.** Other game systems are not currently supported.

## Devices and support

Performance depends on your device, browser, world and modules. I focus on bugs and improvements that help the module across devices.

iPhone and iPad support is best effort. Foundry lists Safari as unsupported, and switching browsers on iOS may still use WebKit. If the map is unstable, try a lighter graphics profile or play with the canvas disabled. [Foundry's browser requirements](https://foundryvtt.com/article/requirements/)

## Install and start playing

1. In Foundry Setup, open **Add-on Modules > Install Module**. Paste this into **Manifest URL** and select **Install**.

   ```text
   https://github.com/Silvestrae/ve-mobile/releases/latest/download/module.json
   ```

2. Enable **VE Mobile** in **Manage Modules** and fully reload Foundry.
3. Open the world on your phone or tablet. Use **Auto-detect** or pick **Phone** or **Tablet** in **Mobile Mode**.

<details>
<summary>Manual installation</summary>

Extract the ZIP from the [latest release](https://github.com/Silvestrae/ve-mobile/releases/latest) into `Data/modules/ve-mobile`. Put `module.json` directly in that folder, beside `src`, `assets` and `locales`, then reload Foundry.

</details>

## Install as an app (PWA)

On Android Chrome or Edge, sign into your world over HTTPS and open **Settings > Device & Power > Install app**. Keep the world name or enter your own. If the button is missing, look in the browser menu for **Install app** or **Add to Home screen**.

On iPhone or iPad, use **Share > Add to Home Screen** in Safari. Your Foundry server still needs to be reachable when you play.

## Phone and tablet layouts

| Layout | How it works |
| --- | --- |
| **Phone** | One pane at a time, with navigation along the bottom. |
| **Tablet Split** | The live map beside your sheet, chat or journal. |
| **Tablet Full** | One wide pane with navigation along the side. |

Use **Split Screen** to switch between the two tablet layouts.

<p align="center">
  <img src="docs/screenshots/s22-orna-character.jpg" alt="Orna's D&amp;D5e character sheet on a Galaxy S22" width="280">
  <img src="docs/screenshots/s22-orna-hex-dpad.jpg" alt="Orna selected on a hex-grid map with the six-direction D-pad over the lodge floor" width="280">
</p>

Orna's character sheet and the six-way hex D-pad on a Galaxy S22. [Watch the 50-second phone demo](docs/media/ve-mobile-phone-demo.mp4).

## Dungeons & Dragons Fifth Edition

- **Characters and NPCs** have their own sheets with stats, inventory, spells and actions. Tap a row for details and use the action buttons to roll or cast.
- **Groups** show members, shared supplies and travel details. Open a member's sheet and return to the group when you're done.
- **Vehicles** show movement, stations, components and cargo. Use the available system actions from the sheet.

Use **Native configuration & edit** when you need the standard Foundry sheet.

## Pathfinder Second Edition

**PF2e is a community test integration for existing player characters on Foundry v14+.** I mostly play D&D, so if a roll, resource cost or condition looks wrong, tell me what you expected on the standard PF2e sheet. [Report a PF2e issue](https://github.com/Silvestrae/ve-mobile/issues).

### PF2e phone screenshots

<details>
<summary>PF2e phone screenshots in dark and light mode</summary>

Seelah shows the character sheet, attacks and inventory. Kyra shows spellcasting and spell preparation. These screenshots are from VE Mobile 1.2.0 in Phone mode on Foundry VTT 14.369 with PF2e 8.6.1.

| View | Dark | Light |
| --- | --- | --- |
| Seelah’s character sheet | <img src="docs/screenshots/pf2e/character-dark.jpg" alt="Seelah’s character sheet in dark mode" width="240"> | <img src="docs/screenshots/pf2e/character-light.jpg" alt="Seelah’s character sheet in light mode" width="240"> |
| Seelah’s actions | <img src="docs/screenshots/pf2e/actions-dark.jpg" alt="Seelah’s actions and attacks in dark mode" width="240"> | <img src="docs/screenshots/pf2e/actions-light.jpg" alt="Seelah’s actions and attacks in light mode" width="240"> |
| Seelah’s inventory | <img src="docs/screenshots/pf2e/inventory-dark.jpg" alt="Seelah’s inventory in dark mode" width="240"> | <img src="docs/screenshots/pf2e/inventory-light.jpg" alt="Seelah’s inventory in light mode" width="240"> |
| Kyra’s spellcasting | <img src="docs/screenshots/pf2e/spellcasting-dark.jpg" alt="Kyra’s spellcasting tab in dark mode" width="240"> | <img src="docs/screenshots/pf2e/spellcasting-light.jpg" alt="Kyra’s spellcasting tab in light mode" width="240"> |
| Kyra’s spell preparation | <img src="docs/screenshots/pf2e/spell-preparation-dark.jpg" alt="Kyra’s spell preparation in dark mode" width="240"> | <img src="docs/screenshots/pf2e/spell-preparation-light.jpg" alt="Kyra’s spell preparation in light mode" width="240"> |

The portraits come from the PF2e system’s Paizo iconics. Both headers use *Merab, Golden Temple* by Mirco Paganessi. [Header artwork credits](assets/header-banners/credits.html)

</details>

### What you can do

- Roll checks, saves and attacks, including multiple attack penalties. Manage conditions, persistent damage, shields and supported class resources.
- Manage prepared spells and cast from your sheet, including supported rituals, scrolls and wands.
- Use the Crafting tab for formulas, crafting checks and supported alchemy. The Pathfinder Society tab covers character details, factions, reputation and boons.

The actor chooser lists player characters. Character creation, advancement, Society reporting and full staff preparation and charges are outside the current scope. Specialist class and third-party mechanics vary.

## Controls and shortcuts

Tap the character header chevron to switch actors. Tap rows to read details, or use the roll and cast buttons to act. Hold supported items or skills for shortcuts. The **Character Quickbar** follows the selected actor, and the **Foundry Hotbar** uses your macros.

For holds, placement and other shortcuts, open **Settings > Support > Controls & Gestures**.

## Scene and token movement

Drag to pan and pinch to zoom. Tap an owned token to select it, double-tap a visible token to target it, or hold an owned token for its controls. GMs can double-tap the **Scene** tab to pause or unpause.

Choose **Joystick** or **D-pad** in **Settings > Scene & Controls > Movement control**. Drag the joystick from its centre, or tap the D-pad to move one step at a time. The D-pad has six directions on hex grids and eight on square or gridless scenes. Foundry still handles walls, ownership and movement rules.

Turn on **Return to Scene after actions** if you want supported actions to bring you back to the map in Phone or Tablet Full.

## Chat, journals, and combat

- **Chat** keeps your system's roll cards and messages, with an unread badge that clears when you reach the newest message.
- **Journals** show folders and pages. Pinch to change text size, or open an image to zoom in.
- **Combat** shows the turn order and the controls your role allows. The optional carousel keeps the order and **End Turn** on the map.

## Appearance and performance

Choose light, dark or system appearance and adjust class colours in **Settings > Appearance**.

In 1.2.0, go to **Settings > Appearance > Character header artwork** to pick **Artwork** for bundled illustrations, **Procedural SVG** for a scene based on the actor's class and name, **Custom** for your own image or **Off**. You can set a custom image for one actor or use the same image across all actors on your account.

For demanding maps, try a lighter graphics profile in **Performance & Memory**. GMs can use the **Mobile Asset Optimizer** to make smaller copies of scene images. **Disable game canvas** keeps sheets, chat and journals available. Map actions and some automation still need the canvas.

## Localisation

1.2.0 ships with **US English, Australian English and Russian**. Thanks to [Mokudgo](https://github.com/Mokudgo) for translating and testing Russian.

I've taken German, Spanish, French and Italian out for now. I'd like a native speaker to check each localisation file before I add that language back. If you'd like to help, [open an issue](https://github.com/Silvestrae/ve-mobile/issues) and I'll send you the file. Until then, VE Mobile uses English where it doesn't have a translation.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| An update is missing | Fully reload Foundry and check the installed version. |
| An actor or action is missing | Check ownership, the selected actor or token, and system support. |
| A session looks stale | Try reconnect or resync, then **Reload Foundry**. |
| The map is slow or crashes | Try a lighter graphics profile or disable the game canvas. |
| A native screen needs more space | Switch to **Desktop** in **Mobile Mode**. |

## Feedback and support

If something breaks, tell me what you did, what you expected and what happened. Include your device, browser, Foundry, system and VE Mobile versions, plus any relevant modules. [Report a bug or suggest a feature](https://github.com/Silvestrae/ve-mobile/issues).

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/silvestrae)

## License and credits

VE Mobile's code is under the [MIT Licence](LICENSE). Bundled fonts, badges and illustrations have their own notices and terms. The battlemap is credited below and is not bundled with the module.

<details>
<summary>Artwork and artist credits</summary>

Thanks to everyone whose work gives these sheets and screenshots their look.

- The Paizo illustrations are by Mary Jane Pajaron, Mirco Paganessi, Sandra Posada, Sam White, Biagio d’Alessandro, Federico Musetti and Roman Roland Kuteynikov.
- The other header illustrations are by David Revoy and the Blender Foundation, Blender Animation Studio and the team behind *Spring* (directed by Andy Goralczyk), Mingho Tong, Aleksey Pollack and Thomas Moran (Smithsonian American Art Museum).
- Orna's portrait uses *Kinytia* by David Revoy, shown cropped to fit the portrait frame. [Original artwork](https://www.peppercarrot.com/en/viewer/misc-src__2010-10-06_Kinytia_by-David-Revoy.html) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- The battlemap in Orna's screenshots is by Cropox Battlemaps. [The Deepwood Hunting Lodge](https://www.patreon.com/CropoxBattlemaps/posts/deepwood-hunting-150490629)

See the [full artwork credits](assets/header-banners/credits.html) for each piece, its source and reuse terms. You can also find them under **Appearance** in VE Mobile Settings.

</details>

I use AI tools to assist with writing code, documentation and testing. [Foundry VTT AI Content Policy](https://foundryvtt.com/article/ai-policy/)

VE Mobile is independent of Foundry Gaming LLC, Wizards of the Coast and Paizo.

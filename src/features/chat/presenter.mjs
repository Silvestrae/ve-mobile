import { localizedText } from "../../ui/localized-text.mjs";
import { icon, node } from "../../ui/dom.mjs";

export function renderChat({ commands, scope }) {
  const host = node("section", {
    className: "ve-native-chat-screen",
    attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.GameChat", "Game chat") }
  });
  const result = commands.mountNativeChat(host, scope);
  if (!result.ok) {
    host.append(node("div", {
      className: "ve-empty",
      children: [icon("fa-comments"), node("h2", { text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ChatIsUnavailable", "Chat is unavailable") }), node("p", { text: result.reason })]
    }));
  }
  return host;
}

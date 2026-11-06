// dsh-wiki 客户端半区：会话头部"Wiki"按钮 → 打开本机 /dsh-wiki 索引页。
// 与 @jieai/dsh-plugin-vet 的 client 装载方式一致：window.__ModuleLoader__.load + factory(require)。
window.__ModuleLoader__.load({
  id: "@acfufu/dsh-wiki",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    var BUTTON_STYLE = {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 9px",
      margin: "0 2px",
      fontSize: 12,
      lineHeight: "18px",
      borderRadius: 7,
      border: "1px solid rgba(127,127,127,0.28)",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      userSelect: "none",
    };

    function WikiButton() {
      var [busy, setBusy] = React.useState(false);
      var openIndex = function () {
        if (busy) return;
        setBusy(true);
        try {
          var win = window.open("/dsh-wiki/", "dsh-wiki");
          if (!win) window.location.assign("/dsh-wiki/");
        } finally {
          setBusy(false);
        }
      };
      return React.createElement(
        "button",
        {
          style: BUTTON_STYLE,
          title: "打开本地 Repo Wiki 索引（dsh-wiki）",
          onClick: openIndex,
          onMouseOver: function (e) { e.currentTarget.style.borderColor = "rgba(127,127,127,0.55)"; },
          onMouseOut: function (e) { e.currentTarget.style.borderColor = "rgba(127,127,127,0.28)"; },
        },
        "📖",
        React.createElement("span", null, busy ? "…" : "Wiki")
      );
    }

    var inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject(
        "conversation.session.header.actions",
        function () {
          return ctx.slots.register(
            { name: "conversation.session.header.actions", id: "dsh-wiki-open", order: 90 },
            WikiButton
          );
        }
      );
    }

    module.exports = { inject: inject, apply: apply };
    return module.exports;
  },
});

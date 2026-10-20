mergeInto(LibraryManager.library, {
  TableTalkEvent: function (kind, value) {
    window.dispatchEvent(new CustomEvent("tabletalk-unity", { detail: { kind: UTF8ToString(kind), value: UTF8ToString(value) } }));
  }
});

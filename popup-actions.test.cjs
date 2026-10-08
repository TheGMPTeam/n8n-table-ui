const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
test("every popup has exactly one accessible top-header Close and no footer Close", () => {
  for (const [modal, close, title] of [
    ["modal", "btn-cancel", "modal-title"],
    ["updater-modal", "updater-close", "updater-title"],
  ]) {
    const start = html.indexOf('id="' + modal + '"');
    const fragment = html.slice(start, html.indexOf("</div>\n</div>", start));
    assert.match(
      fragment,
      new RegExp(
        'class="popup-header"[\\s\\S]*?id="' +
          title +
          '"[\\s\\S]*?id="' +
          close +
          '"[^>]*aria-label="Close',
      ),
    );
    assert.equal(
      (html.match(new RegExp('id="' + close + '"', "g")) || []).length,
      1,
    );
    assert.ok(
      fragment.indexOf('id="' + close + '"') <
        fragment.indexOf(
          'id="' + (modal === "modal" ? "modal-body" : "updater-body") + '"',
        ),
    );
  }
});
test("Save is hidden before rendering view-only or jobs content", () => {
  const open = html.slice(
    html.indexOf("  function openModalByRow("),
    html.indexOf("  function closeModal("),
  );
  assert.match(open, /\$\('#btn-save'\)\.hidden = mode !== 'edit'/);
  assert.ok(
    open.indexOf("$('#btn-save').hidden") <
      open.indexOf("if (mode === 'jobs')"),
  );
  const updater = html.slice(
    html.indexOf("  function openUpdaterModal("),
    html.indexOf(
      "    (async () => {",
      html.indexOf("  function openUpdaterModal("),
    ),
  );
  assert.doesNotMatch(updater, />Save</);
  assert.match(updater, /Apply checked update/);
});

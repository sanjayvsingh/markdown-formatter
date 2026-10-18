const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, parseXml, docxFiles } = require("./helpers");

// Renders Markdown in the app, clicks Download Word and returns the zip parts.
async function wordFor(input, settings) {
  const app = await loadApp({ input, settings });
  app.$("btnDownloadWord").click();
  const files = await docxFiles(app.downloads[0].blob);
  return { files, window: app.window };
}

const SAMPLE = [
  "# Trip Notes & Plans",
  "",
  "Intro with **bold**, *italic*, ~~strike~~, `code` and a [link](https://example.com/?a=1&b=2).",
  "",
  "1. First",
  "2. Second",
  "   - nested",
  "",
  "Between.",
  "",
  "5. Starts at five",
  "",
  "> Quoted",
  "",
  "```",
  "line one",
  "\tindented <tag>",
  "```",
  "",
  "| Left | Right |",
  "|:-----|------:|",
  "| a | b |",
  "",
  "---"
].join("\n");

describe("Word export", () => {
  test("contains every required part, all well-formed XML", async () => {
    const { files, window } = await wordFor(SAMPLE);
    for (const name of ["[Content_Types].xml", "_rels/.rels", "docProps/core.xml",
                        "word/_rels/document.xml.rels", "word/document.xml",
                        "word/styles.xml", "word/numbering.xml"]) {
      assert.ok(files[name], name + " missing");
      parseXml(window, files[name], name);
    }
  });

  test("uses the document title", async () => {
    const { files } = await wordFor(SAMPLE);
    assert.match(files["docProps/core.xml"], /<dc:title>Trip Notes &amp; Plans<\/dc:title>/);
  });

  test("maps headings, quotes, code, rules and tables to Word structures", async () => {
    const doc = (await wordFor(SAMPLE)).files["word/document.xml"];
    assert.match(doc, /<w:pStyle w:val="Heading1"\/>.*Trip Notes &amp; Plans/);
    assert.match(doc, /<w:pBdr><w:left [^>]*\/><\/w:pBdr>.*Quoted/);
    assert.match(doc, /<w:pStyle w:val="CodeBlock"\/>.*line one<\/w:t><w:br\/><w:tab\/><w:t xml:space="preserve">indented &lt;tag&gt;/);
    assert.match(doc, /<w:pStyle w:val="HorizontalRule"\/>/);
    assert.match(doc, /<w:tbl>.*<w:tblHeader\/>.*Left.*<w:jc w:val="right"\/>.*Right/);
  });

  test("turns tabs in code into Word tabs", async () => {
    // Raw HTML, so this checks docx.js itself rather than how marked handles tabs.
    const doc = (await wordFor("<pre>a\tb</pre>")).files["word/document.xml"];
    assert.match(doc, /<w:t xml:space="preserve">a<\/w:t><w:tab\/><w:t xml:space="preserve">b</);
  });

  test("keeps inline formatting and makes links clickable", async () => {
    const { files } = await wordFor(SAMPLE);
    const doc = files["word/document.xml"];
    assert.match(doc, /<w:b\/><\/w:rPr><w:t xml:space="preserve">bold/);
    assert.match(doc, /<w:i\/><\/w:rPr><w:t xml:space="preserve">italic/);
    assert.match(doc, /<w:strike\/><\/w:rPr><w:t xml:space="preserve">strike/);
    assert.match(doc, /<w:rStyle w:val="InlineCode"\/><\/w:rPr><w:t xml:space="preserve">code/);
    assert.match(doc, /<w:hyperlink r:id="rIdLink1"/);
    assert.match(files["word/_rels/document.xml.rels"],
      /Id="rIdLink1"[^>]*Target="https:\/\/example.com\/\?a=1&amp;b=2" TargetMode="External"/);
  });

  test("numbers lists, nests them, and restarts at a list's own start number", async () => {
    const { files } = await wordFor(SAMPLE);
    const doc = files["word/document.xml"];
    assert.match(doc, /<w:ilvl w:val="0"\/><w:numId w:val="1"\/>.*First/);
    assert.match(doc, /<w:ilvl w:val="1"\/><w:numId w:val="2"\/>.*nested/);
    assert.match(files["word/numbering.xml"],
      /<w:num w:numId="3"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"\/>/);
  });

  test("styles carry the chosen fonts, sizes and colours", async () => {
    const { files } = await wordFor("# T", {
      headingFont: "Georgia", headingSize: 30, bodyFont: "Verdana", bodySize: 18,
      monoFont: "Consolas", monoSize: 12, headingFg: "#aa0000", headingFgAuto: false
    });
    const styles = files["word/styles.xml"];
    assert.match(styles, /<w:rPrDefault><w:rPr><w:rFonts w:ascii="Verdana"[^>]*\/><w:sz w:val="27"\/>/);
    assert.match(styles, /w:styleId="Heading1">.*?<w:rFonts w:ascii="Georgia"[^>]*\/><w:b\/><w:bCs\/><w:color w:val="AA0000"\/><w:sz w:val="45"\/>/);
    assert.match(styles, /w:styleId="InlineCode">.*?<w:rFonts w:ascii="Consolas"/);
  });

  test("Auto colours are left out of the styles", async () => {
    const styles = (await wordFor("# T")).files["word/styles.xml"];
    assert.doesNotMatch(styles, /<w:color w:val="(?!2563EB)/);  // only the link colour
    assert.doesNotMatch(styles, /<w:shd /);
  });

  test("escapes special characters and drops ones XML can't hold", async () => {
    const { files, window } = await wordFor("A & B < C > D \"quoted\" \u0001bell");
    const doc = files["word/document.xml"];
    parseXml(window, doc, "document.xml");
    assert.match(doc, /A &amp; B &lt; C &gt; D &quot;quoted&quot; bell/);
  });

  test("an empty document is still a valid file", async () => {
    const { files, window } = await wordFor("");
    parseXml(window, files["word/document.xml"], "document.xml");
    assert.match(files["word/document.xml"], /<w:body><w:p\/><w:sectPr>/);
  });
});

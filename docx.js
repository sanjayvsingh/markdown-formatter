// Builds a Word (.docx) file from the rendered preview, with no dependencies:
// the preview DOM is converted to WordprocessingML, then packed into an
// uncompressed zip. Exposes window.buildDocx(root, settings, title) -> Blob.
(function () {
  "use strict";

  var DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  var XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
             'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  var REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  // Indents are in twips (1/20 pt).
  var LIST_INDENT = 360, QUOTE_INDENT = 300;
  var QUOTE_BORDER = '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="CCCCCC"/></w:pBdr>';
  var BULLETS = ["•", "◦", "▪"];
  var BLOCK = /^(P|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|HR|DIV|DETAILS|SUMMARY|DL|DT|DD|FIGURE|SECTION)$/;

  // ---- Minimal zip writer (stored entries, no compression) ----
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(files, type) {
    var enc = new TextEncoder();
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var entries = [], central = [], offset = 0, centralSize = 0;

    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);          // version needed to extract
      local.setUint16(6, 0x0800, true);      // names are UTF-8
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      entries.push(local, name, data);

      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);            // version made by
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(cen, name);

      offset += 30 + name.length + data.length;
      centralSize += 46 + name.length;
    });

    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob(entries.concat(central, [end]), { type: type });
  }

  // ---- XML helpers ----
  function esc(s) {
    // Control characters are illegal in XML and make Word refuse the file.
    return String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, "")
      .replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
  }

  function hex(color) { return String(color).replace("#", "").toUpperCase(); }
  function halfPoints(px) { return Math.round(px * 1.5); }   // px -> pt -> half-points
  function twips(px) { return Math.round(px * 15); }         // px -> pt -> twips

  function fonts(name) {
    var n = esc(name);
    return '<w:rFonts w:ascii="' + n + '" w:hAnsi="' + n + '" w:cs="' + n + '"/>';
  }
  function size(px) {
    var hp = halfPoints(px);
    return '<w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/>';
  }
  function color(isAuto, value) { return isAuto ? "" : '<w:color w:val="' + hex(value) + '"/>'; }
  function shade(isAuto, value) {
    return isAuto ? "" : '<w:shd w:val="clear" w:color="auto" w:fill="' + hex(value) + '"/>';
  }
  function extend(base, more) { return Object.assign({}, base, more); }

  // Child elements below are written in the order the OOXML schema requires;
  // Word reports the file as corrupt when they're out of order.
  function stylesXml(s) {
    var ratios = [1, .83, .70, .60, .53, .48];
    var box = ["top", "left", "bottom", "right"].map(function (side) {
      return '<w:' + side + ' w:val="single" w:sz="4" w:space="4" w:color="D0D0D0"/>';
    }).join("");
    var gridLines = ["top", "left", "bottom", "right", "insideH", "insideV"].map(function (side) {
      return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>';
    }).join("");

    var headings = ratios.map(function (r, i) {
      var px = s.headingSize * r;
      return '<w:style w:type="paragraph" w:styleId="Heading' + (i + 1) + '">' +
        '<w:name w:val="heading ' + (i + 1) + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
        '<w:pPr><w:keepNext/><w:keepLines/>' + shade(s.headingBgAuto, s.headingBg) +
        '<w:spacing w:before="' + twips(px * 1.2) + '" w:after="' + twips(px * .5) + '" w:line="240" w:lineRule="auto"/>' +
        '<w:outlineLvl w:val="' + i + '"/></w:pPr>' +
        '<w:rPr>' + fonts(s.headingFont) + '<w:b/><w:bCs/>' + color(s.headingFgAuto, s.headingFg) + size(px) + '</w:rPr>' +
        '</w:style>';
    }).join("");

    return XML_HEAD + '<w:styles ' + W_NS + '>' +
      '<w:docDefaults>' +
        '<w:rPrDefault><w:rPr>' + fonts(s.bodyFont) + size(s.bodySize) + '</w:rPr></w:rPrDefault>' +
        '<w:pPrDefault><w:pPr><w:spacing w:after="' + twips(s.bodySize * .6) + '" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>' +
        '<w:pPr>' + shade(s.bodyBgAuto, s.bodyBg) + '</w:pPr>' +
        '<w:rPr>' + color(s.bodyFgAuto, s.bodyFg) + '</w:rPr></w:style>' +
      headings +
      '<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
        '<w:pPr><w:pBdr>' + box + '</w:pBdr>' + shade(s.monoBgAuto, s.monoBg) +
        '<w:spacing w:line="240" w:lineRule="auto"/></w:pPr>' +
        '<w:rPr>' + fonts(s.monoFont) + color(s.monoFgAuto, s.monoFg) + size(s.monoSize) + '</w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="HorizontalRule"><w:name w:val="Horizontal Rule"/><w:basedOn w:val="Normal"/>' +
        '<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr>' +
        '<w:spacing w:before="240" w:after="240"/></w:pPr></w:style>' +
      '<w:style w:type="character" w:styleId="InlineCode"><w:name w:val="Inline Code"/><w:qFormat/>' +
        '<w:rPr>' + fonts(s.monoFont) + color(s.monoFgAuto, s.monoFg) + size(s.monoSize) + shade(s.monoBgAuto, s.monoBg) + '</w:rPr></w:style>' +
      '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>' +
        '<w:rPr><w:color w:val="2563EB"/><w:u w:val="single"/></w:rPr></w:style>' +
      '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>' +
        '<w:tblPr><w:tblBorders>' + gridLines + '</w:tblBorders>' +
        '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="140" w:type="dxa"/>' +
        '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
  }

  // Every <ul>/<ol> gets its own numbering instance so each ordered list
  // restarts at its own start number instead of continuing the previous one.
  function numberingXml(lists) {
    function abstractNum(id, ordered) {
      var levels = "";
      for (var i = 0; i < 9; i++) {
        levels += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/>' +
          '<w:numFmt w:val="' + (ordered ? "decimal" : "bullet") + '"/>' +
          '<w:lvlText w:val="' + (ordered ? "%" + (i + 1) + "." : BULLETS[i % BULLETS.length]) + '"/>' +
          '<w:lvlJc w:val="left"/>' +
          '<w:pPr><w:ind w:left="' + LIST_INDENT * (i + 2) + '" w:hanging="' + LIST_INDENT + '"/></w:pPr></w:lvl>';
      }
      return '<w:abstractNum w:abstractNumId="' + id + '"><w:multiLevelType w:val="hybridMultilevel"/>' + levels + '</w:abstractNum>';
    }
    var nums = lists.map(function (l, i) {
      return '<w:num w:numId="' + (i + 1) + '"><w:abstractNumId w:val="' + (l.ordered ? 1 : 0) + '"/>' +
        (l.ordered ? '<w:lvlOverride w:ilvl="' + l.level + '"><w:startOverride w:val="' + l.start + '"/></w:lvlOverride>' : "") +
        '</w:num>';
    }).join("");
    return XML_HEAD + '<w:numbering ' + W_NS + '>' + abstractNum(0, false) + abstractNum(1, true) + nums + '</w:numbering>';
  }

  // ---- HTML -> WordprocessingML ----
  function convert(root) {
    var links = [], lists = [];

    // Text, with newlines and tabs (from code blocks) as Word breaks and tabs.
    function textXml(text) {
      return text.split("\n").map(function (line) {
        return line.split("\t").map(function (part) {
          return part ? '<w:t xml:space="preserve">' + esc(part) + '</w:t>' : "";
        }).join("<w:tab/>");
      }).join("<w:br/>");
    }

    function run(text, fmt) {
      if (!text) return "";
      var rPr = "";
      if (fmt.code) rPr += '<w:rStyle w:val="InlineCode"/>';
      else if (fmt.link) rPr += '<w:rStyle w:val="Hyperlink"/>';
      if (fmt.b) rPr += "<w:b/>";
      if (fmt.i) rPr += "<w:i/>";
      if (fmt.strike) rPr += "<w:strike/>";
      if (fmt.mark) rPr += '<w:highlight w:val="yellow"/>';
      if (fmt.u) rPr += '<w:u w:val="single"/>';
      if (fmt.vert) rPr += '<w:vertAlign w:val="' + fmt.vert + '"/>';
      return '<w:r>' + (rPr ? '<w:rPr>' + rPr + '</w:rPr>' : "") + textXml(text) + '</w:r>';
    }

    function runs(nodes, fmt) {
      return Array.prototype.map.call(nodes, function (n) { return inline(n, fmt); }).join("");
    }

    function inline(n, fmt) {
      if (n.nodeType === 3) return run(n.nodeValue.replace(/\s+/g, " "), fmt);
      if (n.nodeType !== 1) return "";
      switch (n.tagName) {
        case "BR": return '<w:r><w:br/></w:r>';
        case "IMG": return n.getAttribute("alt") ? run("[" + n.getAttribute("alt") + "]", fmt) : "";
        case "INPUT":
          return n.getAttribute("type") === "checkbox" ? run(n.hasAttribute("checked") ? "☑ " : "☐ ", fmt) : "";
        case "STRONG": case "B": return runs(n.childNodes, extend(fmt, { b: true }));
        case "EM": case "I": return runs(n.childNodes, extend(fmt, { i: true }));
        case "DEL": case "S": case "STRIKE": return runs(n.childNodes, extend(fmt, { strike: true }));
        case "U": case "INS": return runs(n.childNodes, extend(fmt, { u: true }));
        case "MARK": return runs(n.childNodes, extend(fmt, { mark: true }));
        case "SUP": return runs(n.childNodes, extend(fmt, { vert: "superscript" }));
        case "SUB": return runs(n.childNodes, extend(fmt, { vert: "subscript" }));
        case "CODE": case "KBD": case "SAMP": return runs(n.childNodes, extend(fmt, { code: true }));
        case "A":
          var href = n.getAttribute("href") || "";
          var inner = runs(n.childNodes, extend(fmt, { link: true }));
          // In-page anchors and other schemes have nowhere to go in Word.
          if (!/^(https?:|mailto:)/i.test(href)) return inner;
          return '<w:hyperlink r:id="rIdLink' + links.push(href) + '" w:history="1">' + inner + '</w:hyperlink>';
        default: return runs(n.childNodes, fmt);
      }
    }

    // ctx: quote = blockquote depth, level = list depth (-1 outside lists),
    // item = the list item whose number the next paragraph should carry,
    // cell = { jc, bold } inside a table cell.
    function para(ctx, style, content) {
      var pPr = "";
      if (style) pPr += '<w:pStyle w:val="' + style + '"/>';
      var numbered = ctx.item && !ctx.item.used;
      if (numbered) {
        ctx.item.used = true;
        pPr += '<w:numPr><w:ilvl w:val="' + ctx.level + '"/><w:numId w:val="' + ctx.item.numId + '"/></w:numPr>';
      }
      if (ctx.quote) pPr += QUOTE_BORDER;
      if (ctx.cell) pPr += '<w:spacing w:before="60" w:after="60"/>';
      var left = ctx.quote * QUOTE_INDENT + (ctx.level >= 0 ? LIST_INDENT * (ctx.level + 2) : 0);
      if (left) pPr += '<w:ind w:left="' + left + '"' + (numbered ? ' w:hanging="' + LIST_INDENT + '"' : "") + '/>';
      if (ctx.cell && ctx.cell.jc) pPr += '<w:jc w:val="' + ctx.cell.jc + '"/>';
      return '<w:p>' + (pPr ? '<w:pPr>' + pPr + '</w:pPr>' : "") + content + '</w:p>';
    }

    function baseFmt(ctx) { return ctx.cell && ctx.cell.bold ? { b: true } : {}; }

    // Converts a container's children into paragraphs and tables. Loose inline
    // content between block elements (e.g. a tight list item's text) becomes
    // its own paragraph.
    function blocks(parent, ctx) {
      var out = [], pending = [];
      function flush() {
        var hasContent = pending.some(function (n) {
          return n.nodeType === 1 || (n.nodeType === 3 && /\S/.test(n.nodeValue));
        });
        if (hasContent) out.push(para(ctx, null, runs(pending, baseFmt(ctx))));
        pending = [];
      }
      Array.prototype.forEach.call(parent.childNodes, function (n) {
        if (n.nodeType === 1 && BLOCK.test(n.tagName)) {
          flush();
          out.push.apply(out, block(n, ctx));
        } else if (n.nodeType === 1 || n.nodeType === 3) {
          pending.push(n);
        }
      });
      flush();
      return out;
    }

    function block(el, ctx) {
      var tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) return [para(ctx, "Heading" + tag.charAt(1), runs(el.childNodes, baseFmt(ctx)))];
      if (tag === "P") return [para(ctx, null, runs(el.childNodes, baseFmt(ctx)))];
      if (tag === "PRE") return [para(ctx, "CodeBlock", '<w:r>' + textXml(el.textContent.replace(/\n$/, "")) + '</w:r>')];
      if (tag === "HR") return [para(ctx, "HorizontalRule", "")];
      if (tag === "BLOCKQUOTE") return blocks(el, extend(ctx, { quote: ctx.quote + 1 }));
      if (tag === "UL" || tag === "OL") return list(el, ctx);
      if (tag === "TABLE") return table(el);
      return blocks(el, ctx);
    }

    function list(el, ctx) {
      var level = Math.min(ctx.level + 1, 8);
      var ordered = el.tagName === "OL";
      var start = ordered ? parseInt(el.getAttribute("start"), 10) : 1;
      var numId = lists.push({ ordered: ordered, level: level, start: isNaN(start) ? 1 : start });
      var out = [];
      Array.prototype.forEach.call(el.children, function (li) {
        out.push.apply(out, blocks(li, extend(ctx, { level: level, item: { numId: numId, used: false } })));
      });
      return out;
    }

    function table(el) {
      var rows = Array.prototype.slice.call(el.rows);
      var cols = rows.reduce(function (m, r) { return Math.max(m, r.cells.length); }, 0);
      if (!cols) return [];
      var grid = "";
      for (var i = 0; i < cols; i++) grid += '<w:gridCol w:w="' + Math.floor(9360 / cols) + '"/>';

      var body = rows.map(function (row) {
        var isHead = row.parentElement && row.parentElement.tagName === "THEAD";
        var cells = Array.prototype.map.call(row.cells, function (cell) {
          var align = (cell.getAttribute("align") || cell.style.textAlign || "").toLowerCase();
          var jc = { center: "center", right: "right" }[align];
          var isTh = cell.tagName === "TH";
          var content = blocks(cell, { quote: 0, level: -1, item: null, cell: { jc: jc, bold: isTh } }).join("");
          return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' +
            (isTh ? '<w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>' : "") +
            '</w:tcPr>' + (content || "<w:p/>") + '</w:tc>';
        });
        while (cells.length < cols) cells.push('<w:tc><w:p/></w:tc>');
        return '<w:tr>' + (isHead ? '<w:trPr><w:tblHeader/></w:trPr>' : "") + cells.join("") + '</w:tr>';
      }).join("");

      // The empty paragraph after keeps adjacent tables from merging in Word.
      return ['<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
              '<w:tblGrid>' + grid + '</w:tblGrid>' + body + '</w:tbl>', '<w:p/>'];
    }

    var body = blocks(root, { quote: 0, level: -1, item: null }).join("");
    return { body: body || "<w:p/>", links: links, lists: lists };
  }

  window.buildDocx = function (root, settings, title) {
    var doc = convert(root);
    var created = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    var linkRels = doc.links.map(function (href, i) {
      return '<Relationship Id="rIdLink' + (i + 1) + '" Type="' + REL_NS + '/hyperlink" Target="' +
        esc(href) + '" TargetMode="External"/>';
    }).join("");

    return zip([
      { name: "[Content_Types].xml", data: XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '</Types>' },
      { name: "_rels/.rels", data: XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + REL_NS + '/officeDocument" Target="word/document.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '</Relationships>' },
      { name: "docProps/core.xml", data: XML_HEAD +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + esc(title) + '</dc:title>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + created + '</dcterms:created>' +
        '</cp:coreProperties>' },
      { name: "word/_rels/document.xml.rels", data: XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rIdStyles" Type="' + REL_NS + '/styles" Target="styles.xml"/>' +
        '<Relationship Id="rIdNumbering" Type="' + REL_NS + '/numbering" Target="numbering.xml"/>' +
        linkRels + '</Relationships>' },
      { name: "word/document.xml", data: XML_HEAD + '<w:document ' + W_NS + '><w:body>' + doc.body +
        '<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" ' +
        'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>' },
      { name: "word/styles.xml", data: stylesXml(settings) },
      { name: "word/numbering.xml", data: numberingXml(doc.lists) }
    ], DOCX_TYPE);
  };
})();

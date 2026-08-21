(function (root) {
  const HAN_CHARACTER = /[\u3400-\u9fff]/;
  const HAN_NUMERAL_LIST = /^[一二三四五六七八九十]+、\s*\S/;
  const HAN_ORDINAL_LIST = /^(?:第[一二三四五六七八九十]+[，、]|[一二三四五六七八九十]+是)\s*\S/;

  function isHanCharacter(value) {
    return HAN_CHARACTER.test(String(value || ""));
  }

  function normalizeChineseTypography(value) {
    const source = String(value ?? "").replace(/\r/g, "");
    const characters = Array.from(source);
    const normalized = characters.map((character, index) => {
      const previous = characters[index - 1] || "";
      const next = characters[index + 1] || "";
      const touchesChinese = isHanCharacter(previous) || isHanCharacter(next);
      if (!touchesChinese) return character;
      if (character === ",") return "，";
      if (character === "." && /\d/.test(previous) && !/\d/.test(next)) return ".";
      if (character === ".") return "。";
      if (character === ";") return "；";
      if (character === "!") return "！";
      if (character === "?") return "？";
      if (character === ":") return "：";
      return character;
    }).join("");

    return normalized
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/(^|\n)((?:\d[ \t]*\n+)+)(?=\d)/gm, (_match, prefix, fragments) => (
        `${prefix}${fragments.replace(/\s+/g, "")}`
      ))
      .replace(/([^。！？；：\n])\n{2,}(?=\d)/g, "$1")
      .replace(/[ \t]*([，。；！？：、])[ \t]*/g, "$1")
      .replace(/([\u3400-\u9fff])([A-Za-z])/g, "$1 $2")
      .replace(/([A-Za-z])([\u3400-\u9fff])/g, "$1 $2")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isNumberedListLine(value) {
    const line = String(value || "").trim();
    if (!line) return false;
    if (HAN_NUMERAL_LIST.test(line)) return true;
    if (HAN_ORDINAL_LIST.test(line)) return true;
    if (/^\d{1,2}[)）、]\s*\S/.test(line)) return true;
    if (/^\d{1,2}\.\s+\S/.test(line)) return true;
    return /^\d{1,2}\.(?!\d)\S/.test(line);
  }

  function structureInlineLists(value) {
    return String(value || "")
      .replace(/([。！？；：])\s*(?=第[一二三四五六七八九十]+[，、]\s*\S)/g, "$1\n\n")
      .replace(/[ \t]+(?=第[一二三四五六七八九十]+[，、]\s*\S)/g, "\n\n")
      .replace(/([。！？；：])\s*(?=[一二三四五六七八九十]+是\s*\S)/g, "$1\n\n")
      .replace(/[ \t]+(?=[一二三四五六七八九十]+是\s*\S)/g, "\n\n")
      .replace(/([。！？；：])\s*(?=\d{1,2}[)）、]\s*\S)/g, "$1\n\n")
      .replace(/[ \t]+(?=\d{1,2}[)）、]\s*\S)/g, "\n\n")
      .replace(/([。！？；：])\s*(?=\d{1,2}\.(?!\d)\s*\S)/g, "$1\n\n")
      .replace(/[ \t]+(?=\d{1,2}\.(?!\d)\s*\S)/g, "\n\n");
  }

  function joinSoftWrappedLine(current, next) {
    if (!current) return next;
    if (!next) return current;
    const needsSpace = /[A-Za-z]$/.test(current) && /^[A-Za-z]/.test(next);
    return `${current}${needsSpace ? " " : ""}${next}`;
  }

  function unwrapBlock(value) {
    const lines = String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return lines;

    const segments = [];
    let buffer = "";
    const flush = () => {
      if (!buffer) return;
      segments.push(buffer);
      buffer = "";
    };

    lines.forEach((line) => {
      if (isNumberedListLine(line)) {
        flush();
        segments.push(line);
        return;
      }
      buffer = joinSoftWrappedLine(buffer, line);
    });
    flush();
    return segments;
  }

  function groupSentences(value, maxLength) {
    const text = String(value || "").trim();
    if (!text || isNumberedListLine(text)) return text ? [text] : [];
    const sentences = text.match(/[^。！？；]+[。！？；]?/g)
      ?.map((item) => item.trim())
      .filter(Boolean) || [];
    if (sentences.length < 2) return [text];

    const paragraphs = [];
    let buffer = "";
    sentences.forEach((sentence) => {
      if (buffer && buffer.length + sentence.length > maxLength) {
        paragraphs.push(buffer);
        buffer = sentence;
        return;
      }
      buffer += sentence;
    });
    if (buffer) paragraphs.push(buffer);
    return paragraphs;
  }

  function splitReadableBlocks(value, maxLength = 180) {
    const normalized = structureInlineLists(normalizeChineseTypography(value));
    if (!normalized) return [];
    return normalized
      .split(/\n{2,}/)
      .flatMap(unwrapBlock)
      .flatMap((item) => groupSentences(item, maxLength))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizedCitationIds(value) {
    return [...new Set((value || []).map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function citationSetKey(value) {
    return normalizedCitationIds(value).sort().join("\u001f");
  }

  function collapseRepeatedCitationRuns(paragraphs) {
    const items = (paragraphs || []).map((paragraph) => ({
      ...paragraph,
      citationIds: normalizedCitationIds(paragraph.citationIds),
    }));
    return items.map((paragraph, index) => {
      const currentKey = citationSetKey(paragraph.citationIds);
      const nextKey = citationSetKey(items[index + 1]?.citationIds);
      const currentGroup = String(paragraph.citationGroup ?? "default");
      const nextGroup = String(items[index + 1]?.citationGroup ?? "default");
      return {
        ...paragraph,
        displayCitationIds: currentKey && currentKey === nextKey && currentGroup === nextGroup
          ? []
          : paragraph.citationIds,
      };
    });
  }

  function dedupeCitationEntries(entries) {
    const uniqueEntries = [];
    const numberByKey = new Map();
    const citationNumbers = {};

    (entries || []).forEach((entry) => {
      const id = String(entry?.id || "").trim();
      const label = String(entry?.label || "").trim();
      if (!label) return;
      const key = label.toLocaleLowerCase();
      let number = numberByKey.get(key);
      if (!number) {
        number = uniqueEntries.length + 1;
        numberByKey.set(key, number);
        uniqueEntries.push({ ...entry, id, label });
      }
      if (id) citationNumbers[id] = number;
    });

    return { entries: uniqueEntries, citationNumbers };
  }

  root.SalesTextFormat = Object.freeze({
    collapseRepeatedCitationRuns,
    dedupeCitationEntries,
    normalizeChineseTypography,
    splitReadableBlocks,
    structureInlineLists,
  });
})(typeof window === "undefined" ? globalThis : window);

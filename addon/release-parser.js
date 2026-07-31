const QUALITY_RULES = [
  { value: "4k", label: "4K", patterns: [/\b2160p?\b/i, /\b4k\b/i, /\buhd\b/i] },
  { value: "1080p", label: "1080p", patterns: [/\b1080[pi]?\b/i] },
  { value: "720p", label: "720p", patterns: [/\b720[pi]?\b/i] }
];

function hasAny(title, patterns) {
  return patterns.some((pattern) => pattern.test(title));
}

function detectQuality(title) {
  const found = QUALITY_RULES.find((rule) => hasAny(title, rule.patterns));
  return found ? found.value : "unknown";
}

function matchesQuality(title, selectedQuality) {
  if (!selectedQuality || selectedQuality === "all") return true;
  return detectQuality(title) === selectedQuality;
}

function detectSource(title) {
  if (/\bremux\b/i.test(title)) return "REMUX";
  if (/\bweb[ ._-]?dl\b|\bwebdl\b/i.test(title)) return "WEB-DL";
  if (/\bweb[ ._-]?rip\b|\bwebrip\b/i.test(title)) return "WEBRip";
  if (/\buhd[ ._-]?blu[ ._-]?ray\b|\bblu[ ._-]?ray\b|\bbdrip\b/i.test(title)) return "BluRay";
  if (/\bhdtv\b/i.test(title)) return "HDTV";
  if (/\bdvdrip\b|\bdvd\b/i.test(title)) return "DVD";
  return "Source inconnue";
}

function detectVideo(title) {
  const values = [];
  if (/\bdolby[ ._-]?vision\b|\bdoVi\b|\bDV\b/i.test(title)) values.push("Dolby Vision");
  if (/\bhdr10\+\b/i.test(title)) values.push("HDR10+");
  else if (/\bhdr\b/i.test(title)) values.push("HDR");
  if (/\bav1\b/i.test(title)) values.push("AV1");
  else if (/\bx265\b|\bhevc\b|\bh265\b/i.test(title)) values.push("HEVC/x265");
  else if (/\bx264\b|\bavc\b|\bh264\b/i.test(title)) values.push("AVC/x264");
  if (/\b10[ ._-]?bit\b|\b10bit\b/i.test(title)) values.push("10-bit");
  return values;
}

function detectAudio(title) {
  const values = [];
  if (/\batmos\b/i.test(title)) values.push("Atmos");
  if (/\btruehd\b/i.test(title)) values.push("TrueHD");
  else if (/\bdts[ ._-]?hd\b/i.test(title)) values.push("DTS-HD");
  else if (/\bdts\b/i.test(title)) values.push("DTS");
  else if (/\bddp\b|\bdd\+\b|\beac3\b/i.test(title)) values.push("DD+");
  else if (/\bac3\b|\bdd5[ ._-]?1\b/i.test(title)) values.push("AC3");
  else if (/\baac\b/i.test(title)) values.push("AAC");
  else if (/\bopus\b/i.test(title)) values.push("Opus");
  return values;
}

function detectLanguage(title) {
  const values = [];
  if (/\bmulti\b/i.test(title)) values.push("MULTi");
  if (/\bvfi\b/i.test(title)) values.push("VFI");
  if (/\bvff\b/i.test(title)) values.push("VFF");
  if (/\btruefrench\b/i.test(title)) values.push("TRUEFRENCH");
  if (/\bfrench\b|\bfr\b/i.test(title) && values.length === 0) values.push("FR");
  if (/\bvo\b|\benglish\b|\beng\b/i.test(title)) values.push("VO/EN");
  return [...new Set(values)];
}

function sourceScore(source) {
  return {
    REMUX: 500,
    BluRay: 400,
    "WEB-DL": 300,
    WEBRip: 200,
    HDTV: 100,
    DVD: 50,
    "Source inconnue": 0
  }[source] || 0;
}

function qualityScore(quality) {
  return { "4k": 300, "1080p": 200, "720p": 100, unknown: 0 }[quality] || 0;
}

function analyzeRelease(title) {
  const quality = detectQuality(title);
  const source = detectSource(title);
  const video = detectVideo(title);
  const audio = detectAudio(title);
  const languages = detectLanguage(title);

  return {
    quality,
    qualityLabel: QUALITY_RULES.find((rule) => rule.value === quality)?.label || "?",
    source,
    video,
    audio,
    languages,
    score: qualityScore(quality) + sourceScore(source)
  };
}

module.exports = { analyzeRelease, matchesQuality };

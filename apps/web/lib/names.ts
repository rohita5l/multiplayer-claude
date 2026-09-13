const adjectives = ["brisk", "calm", "clever", "crisp", "eager", "gentle", "golden", "happy", "keen", "lively", "lucky", "mellow", "nimble", "quiet", "rapid", "shiny", "sunny", "swift", "tidy", "witty"];
const nouns = ["otter", "falcon", "maple", "harbor", "comet", "meadow", "pebble", "lantern", "summit", "willow", "beacon", "ember", "glacier", "orchid", "river", "saffron", "thistle", "voyage", "zephyr", "juniper"];

/** e.g. "Clever otter" — readable default session names users can rename. */
export function randomSessionName() {
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  return `${a[0].toUpperCase()}${a.slice(1)} ${n}`;
}

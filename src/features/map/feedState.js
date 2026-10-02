export function initialMapFeedOpen(matchMedia) {
  return !matchMedia?.("(max-width: 760px)").matches;
}

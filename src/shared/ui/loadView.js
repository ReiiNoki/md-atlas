// Each retry gets a new invocation; disposed loads cannot publish late results.
export function startViewLoad(load, publish) {
  let current = true;
  publish({ status: "loading" });
  Promise.resolve().then(load).then(
    (module) => { if (current) publish({ status: "ready", Component: module.default }); },
    (error) => { if (current) publish({ status: "error", error }); },
  );
  return () => { current = false; };
}

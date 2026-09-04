import { useCallback, useEffect, useState } from "react";

export type Route = { name: "home" } | { name: "room"; code: string };

export function parseRoute(pathname: string): Route {
  const m = pathname.match(/^\/room\/([A-Za-z]{4})\/?$/);
  if (m) return { name: "room", code: m[1]!.toUpperCase() };
  return { name: "home" };
}

export function roomPath(code: string): string {
  return `/room/${code.toUpperCase()}`;
}

export function useRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    if (location.pathname !== path) history.pushState(null, "", path);
    setRoute(parseRoute(path));
  }, []);

  return [route, navigate];
}

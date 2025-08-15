import { h, render, useState, useEffect, useRef } from "./didact.js";

function useInterval(delay: number, callback: () => void) {
  const savedCallback = useRef<null | (() => void)>(null);

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current?.();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

const inc = (count: number) => count + 1;
const dec = (count: number) => (count > 0 ? count - 1 : 0);

function Counter() {
  const [count, setCount] = useState(1);

  useInterval(500, () => setCount(dec));

  return h("div", {}, [
    h("nav", { "data-cy": "nav" }, [
      h("ul", {}, [
        h("li", {}, [h("a", { href: "/" }, ["Home"])]),
        h("li", {}, [h("a", { href: "/login" }, ["login"])]),
        h("li", {}, [h("a", { href: "/register" }, ["register"])]),
      ]),
    ]),
    h("button", { onClick: () => setCount(inc) }, [`Count: ${count}`]),
  ]);
}

const container = document.getElementById("root");
if (container) render(h(Counter), container);

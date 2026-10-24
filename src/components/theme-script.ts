// Plain module (no "use client") on purpose. The root layout is a Server
// Component: a value it imports from a "use client" file reaches the browser
// as a client reference, not as the value. The <head> script then waits for
// that chunk, and on slow cold loads React re-enters <head> mid-hydration and
// fails with error #418 (issue #20). Keep these strings here.

export const THEME_KEY = "zama-theme";

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

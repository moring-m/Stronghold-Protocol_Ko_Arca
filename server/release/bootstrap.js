// Injected before the game's scripts. All fetches/worker scripts stay on this release.
export function bootstrap(release) {
  return `(()=>{const release=${JSON.stringify(release)};globalThis.__SP_RELEASE=release;
 const pin=input=>{const u=new URL(input,location.href);if(u.origin===location.origin&&!u.pathname.startsWith('/__roll/'))u.searchParams.set('release',release);return u.href;};
 const original=globalThis.fetch.bind(globalThis);globalThis.fetch=(input,init)=>original(input instanceof Request?new Request(pin(input.url),input):pin(input),init);
 const WorkerClass=globalThis.Worker;if(WorkerClass)globalThis.Worker=class extends WorkerClass{constructor(url,options){super(pin(url),options);}};
 const Socket=globalThis.WebSocket;globalThis.WebSocket=class extends Socket{constructor(url,protocols){const u=new URL(url,location.href);if(u.host===location.host)u.searchParams.set('release',release);super(u.href,protocols);}};
})();`;
}

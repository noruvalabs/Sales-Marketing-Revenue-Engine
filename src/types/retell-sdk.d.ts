// The Retell web-call SDK is loaded dynamically in the browser only
// (Calls tab -> "Talk to the agent"). Declared as an untyped module so
// the build never depends on its types; usage is defensive (any).
declare module "retell-client-js-sdk";

import * as modules from "node:module";

const project = new URL("../", import.meta.url).href;
const source = new URL("src/", project).href;

// Node strips types from .ts files. Resolve the project's NodeNext imports for source tests.
modules.registerHooks?.({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !context.parentURL?.startsWith(project)
        || !/^\.{1,2}\//.test(specifier) || !specifier.endsWith(".js")) throw error;

      const target = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (!target.href.startsWith(source)) throw error;
      return nextResolve(target.href, context);
    }
  },
});

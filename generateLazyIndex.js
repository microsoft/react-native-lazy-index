// @ts-check
"use strict";

const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");
const fs = require("fs");
const path = require("path");

/**
 * @typedef {{
 *   type: "app" | "callable";
 *   moduleId: string;
 *   source: string;
 * }} Component;
 *
 * @typedef {{
 *   module: string;
 *   parent?: string;
 *   depth: number;
 *   platformExtensions: string[];
 *   visited: Set<string>;
 *   verbose: boolean;
 * }} ScanState
 */

const DEFAULT_MAX_DEPTH = 3;
const TAG = "react-native-lazy-index";

/**
 * Ensures that specified node is a StringLiteral.
 * @param {import("@babel/types").Node} node
 * @param {string} modulePath
 * @param {import("@babel/types").Identifier} calleeObject
 * @param {import("@babel/types").Identifier} calleeProperty
 * @returns {node is import("@babel/types").StringLiteral}
 */
function ensureStringLiteral(node, modulePath, calleeObject, calleeProperty) {
  if (!t.isStringLiteral(node)) {
    const source = path.relative(process.cwd(), modulePath);
    const startLine = node.loc ? node.loc.start.line : 0;
    console.warn(
      `[${TAG}] ${source}:${startLine}: expected string literal as first argument to ${calleeObject.name}.${calleeProperty.name}()`
    );
    return false;
  }

  return true;
}

/**
 * Generates the index file.
 * @param {Record<string, Component>} components
 * @returns {string}
 */
function generateIndex(components) {
  let shouldImportAppRegistry = false;
  let shouldImportBatchedBridge = false;

  const lines = Object.keys(components).reduce((index, name) => {
    const { type, moduleId, source } = components[name];
    switch (type) {
      case "app":
        shouldImportAppRegistry = true;
        index.push(
          `AppRegistry.registerComponent("${name}", () => {`,
          `  // Source: ${source}`,
          `  require("${moduleId}");`,
          `  return AppRegistry.getRunnable("${name}").componentProvider();`,
          `});`
        );
        break;
      case "callable":
        shouldImportBatchedBridge = true;
        index.push(
          `BatchedBridge.registerLazyCallableModule("${name}", () => {`,
          `  // Source: ${source}`,
          `  require("${moduleId}");`,
          `  return BatchedBridge.getCallableModule("${name}");`,
          `});`
        );
        break;
      default:
        throw new Error(`Unknown component type: ${type}`);
    }
    return index;
  }, /** @type {string[]} */ ([]));

  if (shouldImportBatchedBridge) {
    lines.unshift(
      'const BatchedBridge = require("react-native/Libraries/BatchedBridge/BatchedBridge");'
    );
  }
  if (shouldImportAppRegistry) {
    lines.unshift('const { AppRegistry } = require("react-native");');
  }

  return lines.join("\n");
}

/**
 * Retrieves platform extensions from command line arguments.
 *
 * TODO: This method needs to be implemented.
 *
 * @returns {string[]}
 */
function getPlatformExtensions() {
  return [".ios", ".android", ".native"];
}

/**
 * Same as `parseInt()` but with a default value.
 * @param {string | undefined} s
 * @param {number} defaultValue
 */
function parseIntDefault(s, defaultValue) {
  const value = parseInt(s || "");
  return isNaN(value) ? defaultValue : value;
}

/**
 * @param {string} moduleId
 * @param {string=} parentModule
 * @param {string[]=} platformExtensions
 * @returns {string}
 */
function resolveModule(moduleId, parentModule, platformExtensions = []) {
  const options = {
    paths: [
      ...(() => {
        if (parentModule) {
          return [path.dirname(parentModule)];
        } else if ("paths" in module) {
          return module["paths"];
        } else {
          return [];
        }
      })(),
      process.cwd(),
    ],
  };
  const resolution = platformExtensions.reduce((resolution, extension) => {
    if (!resolution) {
      try {
        return require.resolve(moduleId + extension, options);
      } catch (e) {
        // ignore
      }
    }
    return resolution;
  }, "");
  return resolution || require.resolve(moduleId, options);
}

/**
 * Scans specified module for component registrations.
 * @param {Record<string, Component>} components
 * @param {string} moduleId
 * @param {ScanState} state
 * @returns {Record<string, Component>}
 */
function scanModule(components, moduleId, state) {
  if (
    state.depth === 0 ||
    moduleId.startsWith("@react-native") ||
    moduleId === "react" ||
    moduleId.startsWith("react-native") ||
    moduleId === "redux"
  ) {
    // Let's not go down this rabbit hole.
    return components;
  }

  const paths = state.parent ? [path.dirname(state.parent)] : [];
  if (state.verbose) {
    console.log(`[${TAG}] Trying to resolve '${moduleId}' from '${paths}'`);
  }

  const modulePath = resolveModule(
    moduleId,
    state.parent,
    state.platformExtensions
  );
  if (state.visited.has(modulePath)) {
    return components;
  }

  state.visited.add(modulePath);
  if (state.verbose) {
    console.log(`[${TAG}] Reading ${modulePath}`);
  }

  const source = fs.readFileSync(modulePath, { encoding: "utf-8" });

  /** @type {import("@babel/parser").ParserPlugin[]} */
  const plugins = ["jsx"];
  if (modulePath.endsWith(".ts") || modulePath.endsWith(".tsx")) {
    plugins.push("typescript");
  } else if (source.includes("@flow")) {
    plugins.push("flow");
  }

  const tree = parser.parse(source, {
    sourceType: "module",
    plugins,
  });
  traverse(tree, {
    CallExpression({ node }) {
      if (t.isIdentifier(node.callee) && node.callee.name === "require") {
        const id = node.arguments[0];
        if (t.isStringLiteral(id)) {
          scanModule(components, id.value, {
            ...state,
            parent: modulePath,
            depth: state.depth - 1,
          });
        }
        return;
      }

      if (!t.isMemberExpression(node.callee)) {
        return;
      }

      const { object, property } = node.callee;
      if (!t.isIdentifier(object) || !t.isIdentifier(property)) {
        return;
      }

      if (
        object.name === "AppRegistry" &&
        property.name === "registerComponent"
      ) {
        const [appKey] = node.arguments;
        if (!ensureStringLiteral(appKey, modulePath, object, property)) {
          return;
        }

        components[appKey.value] = {
          type: "app",
          moduleId: state.module,
          source: path.relative(process.cwd(), modulePath),
        };
      } else if (
        object.name === "BatchedBridge" &&
        (property.name === "registerCallableModule" ||
          property.name === "registerLazyCallableModule")
      ) {
        const [name] = node.arguments;
        if (!ensureStringLiteral(name, modulePath, object, property)) {
          return;
        }

        components[name.value] = {
          type: "callable",
          moduleId: state.module,
          source: path.relative(process.cwd(), modulePath),
        };
      }
    },
    ImportDeclaration({ node }) {
      scanModule(components, node.source.value, {
        ...state,
        parent: modulePath,
        depth: state.depth - 1,
      });
    },
  });
  return components;
}

module.exports = () => {
  /** @type {string[]} */
  const experiences = (() => {
    const { experiences } = JSON.parse(
      fs.readFileSync(resolveModule("./package.json"), "utf-8")
    );

    if (Array.isArray(experiences)) {
      return experiences;
    } else if (typeof experiences === "object") {
      const uniqueNames = Object.keys(experiences).reduce(
        (uniqueNames, name) => {
          uniqueNames.add(experiences[name]);
          return uniqueNames;
        },
        /** @type {Set<string>} */ (new Set())
      );
      return [...uniqueNames];
    } else {
      throw new Error("Missing `experiences` section in `package.json`");
    }
  })();

  const depth = parseIntDefault(
    process.env["RN_LAZY_INDEX_MAX_DEPTH"],
    DEFAULT_MAX_DEPTH
  );

  const platformExtensions = getPlatformExtensions();

  /** @type {Set<string>} */
  const visited = new Set();

  const verbose = Boolean(process.env["RN_LAZY_INDEX_VERBOSE"]);

  const components = experiences.reduce(
    (components, module) =>
      scanModule(components, module, {
        module,
        depth,
        platformExtensions,
        visited,
        verbose,
      }),
    /** @type {Record<string, Component>} */ ({})
  );

  return generateIndex(components);
};

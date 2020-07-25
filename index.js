const BatchedBridge = require("react-native/Libraries/BatchedBridge/BatchedBridge");
BatchedBridge.registerCallableModule("ReactExperienceLoader", {
  load: (...names) => names.forEach(codegen.require("inlineRequireModules")),
});

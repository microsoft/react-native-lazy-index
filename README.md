# react-native-lazy-index

[![npm version](https://badge.fury.io/js/react-native-lazy-index.svg)](https://badge.fury.io/js/react-native-lazy-index)

`react-native-lazy-index` is a RAM bundle friendly, bundle-time generated
`index.js`. Improve your app startup time by only loading features you'll use on
demand.

For information on RAM bundles and inline requires, see
[React Native Performance](https://facebook.github.io/react-native/docs/performance#ram-bundles-inline-requires).

If you use [Haul](https://github.com/callstack/haul), also take a look at their
[documentation](https://github.com/callstack/haul/blob/2c68e97766f9f6c2632c46e40631bd7aaacdc75b/docs/CLI%20Commands.md#haul-ram-bundle).

## Installation

```sh
npm install --save react-native-lazy-index
```

## Usage

`react-native-lazy-index` uses
[`babel-plugin-codegen`](https://github.com/kentcdodds/babel-plugin-codegen#configure-with-babel),
so you'll need to configure Babel to include it. The recommended way is to add
it to your `.babelrc`:

```json
{
  "plugins": ["codegen"]
}
```

In your `package.json`, add a section called `"experiences"` with the features
that should be lazy loaded. In the example below, we have four features keyed on
unique names:

```json
{
  "name": "MyAwesomeApp",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@MyAwesomeApp/SomeFeature": "*",
    "@MyAwesomeApp/AnotherFeature": "*",
    "@MyAwesomeApp/YetAnotherFeature": "*",
    "@MyAwesomeApp/FinalFeature": "*",
    "react": "16.9.0",
    "react-native": "0.61.4",
    "react-native-lazy-index": "^1.0.0"
  },
  "experiences": {
    "Some": "@MyAwesomeApp/SomeFeature",
    "Another": "@MyAwesomeApp/AnotherFeature",
    "YetAnother": "@MyAwesomeApp/YetAnotherFeature",
    "Final": "@MyAwesomeApp/FinalFeature"
  }
}
```

Import `react-native-lazy-index` in your `index.js`:

```js
import "react-native-lazy-index";
```

On the native side, you can now load your experiences by invoking
`ReactExperienceLoader.load()`. As an example, we will load two features,
`AnotherFeature` and `YetAnotherFeature`:

```objc
// iOS
[bridge enqueueJSCall:@"ReactExperienceLoader"
               method:@"load"
                 args:@[@"Another", @"YetAnother"]
           completion:nil];
```

```java
// Android
ReactInstanceManager reactInstanceManager = reactNativeHost.getReactInstanceManager();
ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
CatalystInstance catalystInstance = reactContext.getCatalystInstance();

WritableNativeArray features = new WritableNativeArray();
features.pushString("Another");
features.pushString("YetAnother");

catalystInstance.callFunction("ReactExperienceLoader", "load", features);
```

## Why

With a naive `index.js`, all features will be loaded when your app starts and
React Native is initialized for the first time.

```js
import "@MyAwesomeApp/SomeFeature";
import "@MyAwesomeApp/AnotherFeature";
import "@MyAwesomeApp/YetAnotherFeature";
import "@MyAwesomeApp/FinalFeature";
```

By loading features on demand, we can improve app startup time.

With `react-native-lazy-index`, we no longer load all features up front.
Instead, `index.js` registers a callable module, `ReactExperienceLoader`,
allowing full control over when a feature is loaded. Features that are never
used, should never be loaded.

```js
const BatchedBridge = require("react-native/Libraries/BatchedBridge/BatchedBridge");
BatchedBridge.registerCallableModule("ReactExperienceLoader", {
  load: (...names) =>
    names.forEach(name => {
      switch (name) {
        case "SomeFeature":
          return require("@MyAwesomeApp/SomeFeature");
        case "AnotherFeature":
          return require("@MyAwesomeApp/AnotherFeature");
        case "YetAnotherFeature":
          return require("@MyAwesomeApp/YetAnotherFeature");
        case "FinalFeature":
          return require("@MyAwesomeApp/FinalFeature");
      }
    })
});
```

## Contributing

This project welcomes contributions and suggestions. Most contributions require
you to agree to a Contributor License Agreement (CLA) declaring that you have
the right to, and actually do, grant us the rights to use your contribution. For
details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether
you need to provide a CLA and decorate the PR appropriately (e.g., status check,
comment). Simply follow the instructions provided by the bot. You will only need
to do this once across all repos using our CLA.

This project has adopted the
[Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the
[Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any
additional questions or comments.

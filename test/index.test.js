describe("react-native-lazy-index", () => {
  const babel = require("@babel/core");
  const { spawnSync } = require("child_process");
  const path = require("path");

  const currentWorkingDir = process.cwd();

  /**
   * Generates a sequence from RegEx matches.
   * @param {string} str
   * @param {RegExp} regex
   * @returns {Generator<string, void>}
   */
  function* generateSequence(str, regex) {
    let m = regex.exec(str);
    while (m) {
      yield m[1];
      m = regex.exec(str);
    }
  }

  /**
   * Tests the specified fixture.
   * @param {string} fixture
   * @returns {import("@babel/core").BabelFileResult | null}
   */
  function transformFixture(fixture) {
    const workingDir = path.join(__dirname, "__fixtures__", fixture);
    process.chdir(workingDir);
    return babel.transformSync(
      `codegen.require("../../../generateLazyIndex");`,
      {
        cwd: workingDir,
        filename: `${fixture}.js`,
        plugins: ["codegen"],
      }
    );
  }

  afterEach(() => process.chdir(currentWorkingDir));

  test("wraps AppRegistry.registerComponent calls", () => {
    const result = transformFixture("AppRegistry");
    expect(result).toBeTruthy();
    // @ts-ignore object is possibly 'null'
    expect(result.code).toMatchSnapshot();
  });

  test("wraps BatchedBridge.registerCallableModule calls", () => {
    const result = transformFixture("BatchedBridge");
    expect(result).toBeTruthy();
    // @ts-ignore object is possibly 'null'
    expect(result.code).toMatchSnapshot();
  });

  test("wraps registered components", () => {
    const result = transformFixture("MyAwesomeApp");
    expect(result).toBeTruthy();
    // @ts-ignore object is possibly 'null'
    expect(result.code).toMatchSnapshot();
  });

  test("packs only necessary files", () => {
    const files = Array.from(
      generateSequence(
        spawnSync("npm", ["pack", "--dry-run"]).output.toString(),
        /[.\d]+k?B\s+([^\s]*)/g
      )
    );
    expect(files.sort()).toEqual([
      "CODE_OF_CONDUCT.md",
      "LICENSE",
      "README.md",
      "SECURITY.md",
      "generateLazyIndex.js",
      "index.js",
      "package.json",
    ]);
  });
});

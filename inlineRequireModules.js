// @ts-check

const fs = require("fs");
const { experiences } = JSON.parse(
  fs.readFileSync(
    require.resolve("./package.json", {
      paths: [".", ...(module.parent ? module.parent.paths : [])]
    }),
    "utf8"
  )
);

module.exports = `name => {
  switch (name) {
    ${Object.keys(experiences)
      .map(name => `case "${name}": return require("${experiences[name]}");`)
      .join("")}
  }
}`;

import { createRepeatCommand } from "./base.js";

export default createRepeatCommand({
  name: "devil",
  aliases: ["شيطان", "d"],
  propertyName: "devilLoops",
  intervalSeconds: 60,
});


import type { LaunchOptions } from "./types";

export function getLaunchOptions(argv: string[], env: NodeJS.ProcessEnv = process.env): LaunchOptions {
  const mockStateFileArg = argv.find((argument) => argument.startsWith("--mock-state-file="));
  const automationScratchExecutablePathArg = argv.find((argument) =>
    argument.startsWith("--automation-scratch-path=")
  );

  return {
    startHidden: argv.includes("--hidden"),
    mockStateFile:
      mockStateFileArg?.slice("--mock-state-file=".length) ??
      env.DESKTOP_COMPANION_MOCK_STATE_FILE,
    automationActions:
      argv.includes("--automation-actions") ||
      env.DESKTOP_COMPANION_AUTOMATION_ACTIONS === "1",
    automationScratchExecutablePath:
      automationScratchExecutablePathArg?.slice("--automation-scratch-path=".length) ??
      env.DESKTOP_COMPANION_AUTOMATION_SCRATCH_PATH
  };
}

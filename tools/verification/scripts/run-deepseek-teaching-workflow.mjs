import { createWorkflowConfig } from "../workflows/deepseek-teaching/config.mjs";
import { runTeachingWorkflow } from "../workflows/deepseek-teaching/workflow.mjs";

async function main() {
  const config = createWorkflowConfig(process.argv);
  const result = await runTeachingWorkflow(config);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

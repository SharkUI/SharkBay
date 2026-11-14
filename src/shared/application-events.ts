export const applicationEvents = {
  terminalData: "terminal:data",
  terminalUpdate: "terminal:update",
  terminalExit: "terminal:exit",
  terminalControl: "terminal:control",
  openArtifact: "terminal:openArtifact",
  artifactRunStarted: "artifacts:started",
  reviewRunStarted: "reviews:started",
  reviewRunUpdated: "reviews:updated",
  installLog: "agents:installLog",
  agentStatus: "agents:status",
  protocolTasksChanged: "protocol:tasksChanged",
} as const;

import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";

export type AiWorkflowCheckpointStatus =
  | "approval_requested"
  | "approved"
  | "declined"
  | "executed"
  | "failed"
  | "handoff";

export type AiWorkflowCheckpoint = {
  id: string;
  actionId: string | null;
  actionLabel: string | null;
  status: AiWorkflowCheckpointStatus;
  summary: string | null;
  source: "owner" | "assistant" | "system";
  createdAt: string;
};

export type AiConversationReplayMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AiConversationWorkflowSnapshot = {
  intent?: string | null;
  intentLabel?: string | null;
  suggestions?: string[];
  actions?: AiAgentAction[];
  agentPlan?: AiAgentPlan | null;
  completedActionIds?: string[];
  declinedActionIds?: string[];
  pendingApprovalActionId?: string | null;
  latestCheckpoint?: AiWorkflowCheckpoint | null;
  updatedAt?: string | null;
};

export type AiConversationReplayPayload = {
  conversationId: string | null;
  threadId: string | null;
  messages: AiConversationReplayMessage[];
  workflow: AiConversationWorkflowSnapshot | null;
};

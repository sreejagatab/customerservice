/**
 * Workflow Node Types
 * Custom node components for the workflow builder
 */

import { TriggerNode } from './TriggerNode';
import { AiNode } from './AiNode';
import { MessageNode } from './MessageNode';
import { ConditionNode } from './ConditionNode';
import { ActionNode } from './ActionNode';

export const WorkflowNodeTypes = {
  triggerNode: TriggerNode,
  aiNode: AiNode,
  messageNode: MessageNode,
  conditionNode: ConditionNode,
  actionNode: ActionNode,
};

export {
  TriggerNode,
  AiNode,
  MessageNode,
  ConditionNode,
  ActionNode,
};

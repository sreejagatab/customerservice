/**
 * Visual Workflow Builder Page
 * Drag-and-drop interface for creating automation workflows
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  ReactFlowProvider,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { WorkflowToolbar } from '@/components/workflow/WorkflowToolbar';
import { WorkflowSidebar } from '@/components/workflow/WorkflowSidebar';
import { WorkflowNodeTypes } from '@/components/workflow/nodes';
import { WorkflowEdgeTypes } from '@/components/workflow/edges';
import { WorkflowPropertiesPanel } from '@/components/workflow/WorkflowPropertiesPanel';
import { WorkflowTestPanel } from '@/components/workflow/WorkflowTestPanel';
import { useWorkflowStore } from '@/store/workflowStore';
import { useToast } from '@/hooks/useToast';
import { StepType, TriggerType } from '@universal-ai-cs/shared';

const initialNodes: Node[] = [
  {
    id: 'trigger-1',
    type: 'triggerNode',
    position: { x: 100, y: 100 },
    data: {
      type: TriggerType.MESSAGE_RECEIVED,
      label: 'Message Received',
      config: {},
    },
  },
];

const initialEdges: Edge[] = [];

export const WorkflowBuilder: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const {
    currentWorkflow,
    saveWorkflow,
    validateWorkflow,
    testWorkflow,
    isLoading,
  } = useWorkflowStore();

  // Handle connection between nodes
  const onConnect = useCallback(
    (params: Connection) => {
      const edge = {
        ...params,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  // Handle drag over for dropping new nodes
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop of new nodes from sidebar
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type || !reactFlowBounds) {
        return;
      }

      const position = reactFlowInstance?.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      if (!position) return;

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type: getNodeType(type),
        position,
        data: {
          type,
          label: getNodeLabel(type),
          config: getDefaultConfig(type),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
      setSelectedEdge(null);
      setPropertiesPanelOpen(true);
    },
    []
  );

  // Handle edge selection
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge);
      setSelectedNode(null);
      setPropertiesPanelOpen(true);
    },
    []
  );

  // Handle node updates
  const onNodeUpdate = useCallback(
    (nodeId: string, updates: Partial<Node['data']>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...updates } }
            : node
        )
      );
    },
    [setNodes]
  );

  // Save workflow
  const handleSave = useCallback(async () => {
    if (!currentWorkflow) return;

    try {
      const workflowData = {
        ...currentWorkflow,
        steps: nodes.map((node) => ({
          id: node.id,
          type: node.data.type,
          name: node.data.label,
          config: node.data.config,
          position: node.position,
          connections: edges
            .filter((edge) => edge.source === node.id)
            .map((edge) => ({
              targetStepId: edge.target,
              condition: edge.data?.condition,
            })),
        })),
      };

      await saveWorkflow(workflowData);
      toast.success('Workflow saved successfully');
    } catch (error) {
      toast.error('Failed to save workflow');
      console.error('Save error:', error);
    }
  }, [currentWorkflow, nodes, edges, saveWorkflow, toast]);

  // Validate workflow
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setValidationErrors([]);

    try {
      const workflowData = {
        triggers: nodes
          .filter((node) => node.type === 'triggerNode')
          .map((node) => ({
            type: node.data.type,
            config: node.data.config,
          })),
        steps: nodes
          .filter((node) => node.type !== 'triggerNode')
          .map((node) => ({
            id: node.id,
            type: node.data.type,
            name: node.data.label,
            config: node.data.config,
            position: node.position,
          })),
      };

      const validation = await validateWorkflow(workflowData);
      
      if (validation.isValid) {
        toast.success('Workflow validation passed');
      } else {
        setValidationErrors(validation.errors || []);
        toast.error('Workflow validation failed');
      }
    } catch (error) {
      toast.error('Validation failed');
      console.error('Validation error:', error);
    } finally {
      setIsValidating(false);
    }
  }, [nodes, validateWorkflow, toast]);

  // Test workflow
  const handleTest = useCallback(async () => {
    setTestPanelOpen(true);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Toolbar */}
      <WorkflowToolbar
        onSave={handleSave}
        onValidate={handleValidate}
        onTest={handleTest}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleProperties={() => setPropertiesPanelOpen(!propertiesPanelOpen)}
        isLoading={isLoading}
        isValidating={isValidating}
        validationErrors={validationErrors}
      />

      <div className="flex-1 flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <WorkflowSidebar
            onClose={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Canvas */}
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <div
              ref={reactFlowWrapper}
              className="w-full h-full"
              onDrop={onDrop}
              onDragOver={onDragOver}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setReactFlowInstance}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                nodeTypes={WorkflowNodeTypes}
                edgeTypes={WorkflowEdgeTypes}
                fitView
                attributionPosition="bottom-left"
              >
                <Controls />
                <MiniMap />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                
                <Panel position="top-right">
                  <div className="bg-white rounded-lg shadow-lg p-4 space-y-2">
                    <div className="text-sm font-medium text-gray-700">
                      Nodes: {nodes.length}
                    </div>
                    <div className="text-sm font-medium text-gray-700">
                      Connections: {edges.length}
                    </div>
                  </div>
                </Panel>
              </ReactFlow>
            </div>
          </ReactFlowProvider>
        </div>

        {/* Properties Panel */}
        {propertiesPanelOpen && (
          <WorkflowPropertiesPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onNodeUpdate={onNodeUpdate}
            onClose={() => setPropertiesPanelOpen(false)}
          />
        )}
      </div>

      {/* Test Panel */}
      {testPanelOpen && (
        <WorkflowTestPanel
          workflow={currentWorkflow}
          onClose={() => setTestPanelOpen(false)}
        />
      )}
    </div>
  );
};

// Helper functions
function getNodeType(stepType: string): string {
  if (stepType.startsWith('trigger_')) return 'triggerNode';
  if (stepType.startsWith('ai_')) return 'aiNode';
  if (stepType.startsWith('condition')) return 'conditionNode';
  if (stepType.includes('message') || stepType.includes('email')) return 'messageNode';
  return 'actionNode';
}

function getNodeLabel(stepType: string): string {
  const labels: Record<string, string> = {
    [StepType.AI_CLASSIFY]: 'AI Classify',
    [StepType.AI_GENERATE_RESPONSE]: 'Generate Response',
    [StepType.SEND_MESSAGE]: 'Send Message',
    [StepType.SEND_EMAIL]: 'Send Email',
    [StepType.CONDITION]: 'Condition',
    [StepType.DELAY]: 'Delay',
    [StepType.ESCALATE_TO_HUMAN]: 'Escalate to Human',
    // Add more labels as needed
  };
  
  return labels[stepType] || stepType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getDefaultConfig(stepType: string): Record<string, any> {
  const configs: Record<string, Record<string, any>> = {
    [StepType.AI_CLASSIFY]: {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      categories: ['complaint', 'inquiry', 'compliment'],
    },
    [StepType.AI_GENERATE_RESPONSE]: {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 500,
    },
    [StepType.SEND_MESSAGE]: {
      template: 'Thank you for your message. We will get back to you soon.',
    },
    [StepType.CONDITION]: {
      operator: 'equals',
      value: '',
    },
    [StepType.DELAY]: {
      duration: 5,
      unit: 'minutes',
    },
  };
  
  return configs[stepType] || {};
}
